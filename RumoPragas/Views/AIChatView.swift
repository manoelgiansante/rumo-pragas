import SwiftUI

struct AIChatView: View {
    @State private var viewModel = AIChatViewModel()
    @FocusState private var isInputFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if viewModel.messages.isEmpty {
                    emptyState
                } else {
                    messagesList
                }

                inputBar
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(AppTheme.techGradient)
                                .frame(width: 28, height: 28)
                            Image(systemName: "sparkles")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                        }
                        Text("Agro IA")
                            .font(.headline.weight(.bold))
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    if !viewModel.messages.isEmpty {
                        Button {
                            viewModel.clearChat()
                        } label: {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Limpar conversa")
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        ScrollView {
            VStack(spacing: 28) {
                Spacer(minLength: 40)

                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [AppTheme.accent.opacity(0.12), .clear],
                                center: .center,
                                startRadius: 0,
                                endRadius: 70
                            )
                        )
                        .frame(width: 140, height: 140)

                    ZStack {
                        Circle()
                            .fill(AppTheme.techGradient)
                            .frame(width: 80, height: 80)
                            .shadow(color: AppTheme.accent.opacity(0.3), radius: 20, y: 8)

                        Image(systemName: "sparkles")
                            .font(.system(.largeTitle, weight: .medium))
                            .foregroundStyle(.white)
                            .symbolEffect(.pulse, options: .repeating.speed(0.4), isActive: !reduceMotion)
                    }
                }

                VStack(spacing: 8) {
                    Text("Agro IA")
                        .font(.title.bold())
                    Text("Seu assistente especializado em pragas\ne manejo integrado de pragas (MIP)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                }

                VStack(spacing: 10) {
                    Text("Pergunte sobre:")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .textCase(.uppercase)
                        .tracking(0.5)

                    ForEach(viewModel.suggestions, id: \.self) { suggestion in
                        Button {
                            Task { await viewModel.sendSuggestion(suggestion) }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "leaf.fill")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.accent)

                                Text(suggestion)
                                    .font(.subheadline)
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)

                                Spacer()

                                Image(systemName: "arrow.up.right")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .background(Color(.secondarySystemGroupedBackground))
                            .clipShape(.rect(cornerRadius: 14))
                        }
                    }
                }
                .padding(.horizontal, 20)

                Spacer(minLength: 20)
            }
        }
    }

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(viewModel.messages) { message in
                        MessageBubbleView(message: message)
                            .id(message.id)
                    }

                    if viewModel.isSending {
                        TypingIndicatorView()
                            .id("typing")
                    }

                    if let error = viewModel.errorMessage {
                        ErrorBubbleView(message: error)
                            .id("error")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                withAnimation(.easeOut(duration: 0.3)) {
                    if viewModel.isSending {
                        proxy.scrollTo("typing", anchor: .bottom)
                    } else if let last = viewModel.messages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: viewModel.isSending) { _, newValue in
                if newValue {
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo("typing", anchor: .bottom)
                    }
                }
            }
        }
    }

    private var canSend: Bool {
        !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !viewModel.isSending
    }

    private var inputBar: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Pergunte sobre pragas...", text: $viewModel.inputText, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(.rect(cornerRadius: 22))
                    .focused($isInputFocused)

                SendButton(canSend: canSend) {
                    isInputFocused = false
                    Task { await viewModel.sendMessage() }
                }
                .sensoryFeedback(.impact(weight: .light), trigger: viewModel.isSending)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.bar)
        }
    }
}

struct SendButton: View {
    let canSend: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.up")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(canSend ? .white : .secondary)
                .frame(width: 44, height: 44)
                .background(
                    Circle().fill(
                        canSend
                            ? AnyShapeStyle(AppTheme.techGradient)
                            : AnyShapeStyle(Color(.tertiarySystemFill))
                    )
                )
        }
        .disabled(!canSend)
        .accessibilityLabel("Enviar mensagem")
    }
}

struct MessageBubbleView: View {
    let message: ChatMessage

    private var isUser: Bool { message.role == .user }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isUser { Spacer(minLength: 48) }

            if !isUser {
                ZStack {
                    Circle()
                        .fill(AppTheme.techGradient)
                        .frame(width: 30, height: 30)

                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                }
                .padding(.top, 4)
            }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(.subheadline)
                    .foregroundStyle(isUser ? .white : .primary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        isUser
                            ? AnyShapeStyle(AppTheme.heroGradient)
                            : AnyShapeStyle(Color(.secondarySystemGroupedBackground))
                    )
                    .clipShape(
                        .rect(
                            topLeadingRadius: isUser ? 18 : 4,
                            bottomLeadingRadius: 18,
                            bottomTrailingRadius: isUser ? 4 : 18,
                            topTrailingRadius: 18
                        )
                    )

                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.quaternary)
                    .padding(.horizontal, 4)
            }

            if !isUser { Spacer(minLength: 48) }
        }
        .padding(.vertical, 2)
    }
}

struct TypingIndicatorView: View {
    @State private var dotPhase = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ZStack {
                Circle()
                    .fill(AppTheme.techGradient)
                    .frame(width: 30, height: 30)

                Image(systemName: "sparkles")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
            }
            .padding(.top, 4)

            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(AppTheme.accent.opacity(0.6))
                        .frame(width: 7, height: 7)
                        .offset(y: reduceMotion ? 0 : (dotPhase == Double(index) ? -4 : 0))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(.rect(topLeadingRadius: 4, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 18))
            .onAppear {
                if !reduceMotion {
                    withAnimation(.easeInOut(duration: 0.4).repeatForever(autoreverses: true)) {
                        dotPhase = 2
                    }
                }
            }

            Spacer(minLength: 48)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Agro IA está digitando")
    }
}

struct ErrorBubbleView: View {
    let message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundStyle(AppTheme.warmAmber)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(AppTheme.warmAmber.opacity(0.08))
        .clipShape(.rect(cornerRadius: 12))
        .padding(.horizontal, 4)
    }
}
