import Foundation

nonisolated struct CommunityPost: Identifiable, Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let content: String
    let cropType: String?
    let photoURL: String?
    let tags: [String]
    let likesCount: Int
    let repliesCount: Int
    let isExpertAnswer: Bool
    let createdAt: String
    var authorName: String?
}
