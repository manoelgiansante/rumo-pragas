import Foundation

nonisolated struct PestDataService: Sendable {
    static let allPests: [Pest] = sojaPests + milhoPests + cafePests + algodaoPests + canaPests + trigoPests + arrozPests + feijaoPests + batataPests + tomatePests + mandiocaPests + citrosPests + uvaPests + bananaPests + sorgoPests + amendoimPests + girassolPests + cebolaPests

    static func pests(for crop: CropType) -> [Pest] {
        allPests.filter { $0.crop == crop.rawValue }
    }

    static func search(query: String) -> [Pest] {
        guard !query.isEmpty else { return allPests }
        let q = query.lowercased()
        return allPests.filter {
            $0.namePt.lowercased().contains(q) ||
            $0.scientificName.lowercased().contains(q) ||
            $0.description.lowercased().contains(q)
        }
    }

    static func pest(byId id: String) -> Pest? {
        allPests.first { $0.id == id }
    }

    static let sojaPests: [Pest] = [
        Pest(
            id: "soja-lagarta",
            namePt: "Lagarta-da-soja",
            nameEs: "Oruga de la soja",
            scientificName: "Anticarsia gemmatalis",
            crop: "soja",
            category: "Lepidoptera",
            description: "Principal desfolhadora da cultura da soja no Brasil. As lagartas consomem as folhas, reduzindo a área fotossintética e podendo causar perdas significativas na produtividade.",
            symptoms: [
                "Desfolha intensa começando pelas folhas do terço superior",
                "Presença de lagartas verdes com listras longitudinais brancas",
                "Fezes nas folhas e no solo abaixo das plantas",
                "Falhas no dossel da lavoura em infestações severas"
            ],
            lifecycle: "Ciclo completo de 30-40 dias. Fêmeas colocam 300-1000 ovos nas folhas. Lagartas passam por 6 ínstares larvais. Pupa no solo a 2-3 cm de profundidade.",
            treatmentCultural: "Monitorar com pano de batida a cada 7 dias. Nível de controle: 40 lagartas grandes (>1.5cm) por pano de batida ou 30% de desfolha no período vegetativo. Rotação de culturas e plantio na época recomendada reduzem pressão.",
            treatmentConventional: "Lambda-cialotrina (Karate Zeon, 150 mL/ha, carência 20 dias, classe III). Indoxacarbe (Avatar, 150-200 mL/ha, carência 14 dias, classe III). Metomil (Lannate BR, 600 mL/ha, carência 14 dias, classe I - uso restrito).",
            treatmentOrganic: "Baculovírus anticarsia (AgMNPV) - 50 lagartas equivalentes/ha, aplicar quando lagartas < 1.5cm. Bacillus thuringiensis (Dipel, Agree) - 500g/ha. Trichogramma pretiosum - liberação de 100.000 parasitóides/ha.",
            prevention: "Monitoramento regular com pano de batida. Manter inimigos naturais (percevejos predadores, Nomuraea rileyi). Evitar aplicações preventivas de inseticidas. Usar variedades com resistência parcial.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        ),
        Pest(
            id: "soja-percevejo",
            namePt: "Percevejo-marrom",
            nameEs: "Chinche marrón",
            scientificName: "Euschistus heros",
            crop: "soja",
            category: "Hemiptera",
            description: "Principal sugador de grãos de soja. Causa danos diretos aos grãos, reduzindo peso, qualidade e germinação. Transmite fungos como Nematospora coryli.",
            symptoms: [
                "Grãos chochos, manchados e deformados",
                "Retenção foliar (soja louca)",
                "Vagens com pontuações de alimentação",
                "Presença de adultos marrons e ninfas nos ramos"
            ],
            lifecycle: "Adultos hibernam sob folhas secas. Na primavera, migram para culturas hospedeiras. Fêmeas colocam 5-8 massas de 14 ovos. Ciclo total: 35-50 dias.",
            treatmentCultural: "Monitorar com pano de batida a partir do estádio R3. Nível de controle: 2 percevejos/pano de batida (grão) ou 1/pano (semente). Colheita antecipada quando possível. Destruição de soqueira.",
            treatmentConventional: "Imidacloprido + bifentrina (Galil SC, 300 mL/ha, carência 30 dias, classe III). Acefato (Orthene 750 BR, 400g/ha, carência 14 dias, classe III). Tiametoxam + lambda-cialotrina (Engeo Pleno S, 250 mL/ha, carência 30 dias, classe III).",
            treatmentOrganic: "Trissolcus basalis - parasitoide de ovos, liberar 5.000/ha semanalmente. Beauveria bassiana (Boveril) - 500g/ha, aplicar no início da colonização. Armadilhas com feromônio para monitoramento.",
            prevention: "Evitar monocultura. Semear na época recomendada. Eliminar plantas voluntárias. Favorecer inimigos naturais.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        ),
        Pest(
            id: "soja-ferrugem",
            namePt: "Ferrugem-asiática",
            nameEs: "Roya asiática",
            scientificName: "Phakopsora pachyrhizi",
            crop: "soja",
            category: "Fungi",
            description: "Doença mais devastadora da soja no Brasil. Pode causar perdas de até 80% se não controlada. Doença de notificação obrigatória ao MAPA.",
            symptoms: [
                "Lesões foliares de cor castanha a marrom-escura na face inferior das folhas",
                "Pústulas (urédias) produzindo esporos de cor bege a marrom",
                "Desfolha prematura progressiva de baixo para cima",
                "Maturação antecipada com grãos pequenos"
            ],
            lifecycle: "Uredosporos disseminados pelo vento a longas distâncias. Infecção requer 6h de molhamento foliar a 15-28°C. Período latente de 6-10 dias. Múltiplos ciclos por safra.",
            treatmentCultural: "Vazio sanitário obrigatório (60-90 dias sem soja no campo). Semear cultivares de ciclo precoce. Monitorar a partir de R1 (florescimento). Calendarizar aplicações em áreas endêmicas.",
            treatmentConventional: "Trifloxistrobina + protioconazol (Fox, 400 mL/ha, carência 30 dias, classe III). Azoxistrobina + benzovindiflupir (Elatus, 200g/ha, carência 30 dias, classe III). ⚠️ Resistência documentada a estrobilurinas isoladas e triazois isolados - usar misturas.",
            treatmentOrganic: "Extrato de Melaleuca alternifolia (óleo de tea tree). Bacillus subtilis (Serenade) - efeito parcial. Biocontrole limitado para esta doença - foco em manejo cultural.",
            prevention: "Respeitar vazio sanitário. Monitorar consórcio anti-ferrugem. Usar cultivares com genes de resistência (Rpp1-6). Aplicação preventiva antes dos primeiros sintomas na região.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: true
        )
    ]

    static let milhoPests: [Pest] = [
        Pest(
            id: "milho-lagarta-cartucho",
            namePt: "Lagarta-do-cartucho",
            nameEs: "Gusano cogollero",
            scientificName: "Spodoptera frugiperda",
            crop: "milho",
            category: "Lepidoptera",
            description: "Praga mais importante do milho no Brasil, presente em todas as regiões produtoras. Ataca o cartucho da planta jovem, podendo destruir completamente o ponto de crescimento.",
            symptoms: [
                "Folhas raspadas (lagartas pequenas) evoluindo para furos irregulares",
                "Presença de fezes no cartucho da planta",
                "Destruição do ponto de crescimento em ataques severos",
                "Plantas com aspecto de 'janela' nas folhas"
            ],
            lifecycle: "Ciclo de 30-45 dias. Mariposas colocam 100-300 ovos em massas nas folhas. 6 ínstares larvais. Pupa no solo por 8-12 dias. Até 6 gerações/ano.",
            treatmentCultural: "Monitorar semanalmente desde a emergência. Nível de controle: 20% de plantas com folhas raspadas (V2-V6) ou 10% com nota ≥3 na escala Davis. Milho Bt (Vip3Aa) ainda eficaz.",
            treatmentConventional: "Clorantraniliprole (Premio, 100-150 mL/ha, carência 21 dias, classe III). Spinetoran (Delegate, 150-200 mL/ha, carência 21 dias, classe III). ⚠️ Resistência a piretróides e carbamatos documentada.",
            treatmentOrganic: "Trichogramma pretiosum - 100.000-200.000/ha, 3-4 liberações. Baculovírus spodoptera (SfMNPV) - lagartas < 1cm. Bacillus thuringiensis var. kurstaki - 500g/ha.",
            prevention: "Rotação milho/soja. Destruir restos culturais. Usar híbridos Bt (verificar eficácia na região). Semear nas datas recomendadas.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        ),
        Pest(
            id: "milho-cigarrinha",
            namePt: "Cigarrinha-do-milho",
            nameEs: "Chicharrita del maíz",
            scientificName: "Dalbulus maidis",
            crop: "milho",
            category: "Hemiptera",
            description: "Vetor dos patógenos causadores de enfezamentos (pálido e vermelho) e vírus da risca. Problema crescente no milho safrinha.",
            symptoms: [
                "Enfezamento pálido: folhas esbranquiçadas com estrias",
                "Enfezamento vermelho: avermelhamento das folhas e encurtamento de entrenós",
                "Plantas improdutivas com espigas pequenas ou estéreis",
                "Proliferação de espigas secundárias"
            ],
            lifecycle: "Ciclo de 25-30 dias. Adultos migram de lavouras de milho precoce para safrinha. Transmissão dos patógenos é persistente e propagativa.",
            treatmentCultural: "Eliminar milho tiguera. Evitar plantio consecutivo de milho. Semear no início da janela do safrinha. Usar híbridos tolerantes.",
            treatmentConventional: "Tratamento de sementes com tiametoxam (Cruiser 350 FS). Imidacloprido (Provado 200 SC, 250 mL/ha, carência 28 dias). Aplicações foliares têm eficácia limitada.",
            treatmentOrganic: "Controle biológico pouco eficaz. Foco em manejo cultural: eliminação de fontes de inóculo, época de semeadura adequada e híbridos tolerantes.",
            prevention: "Não plantar milho sobre milho. Eliminar plantas voluntárias. Respeitar janela de semeadura. Usar híbridos com tolerância.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let cafePests: [Pest] = [
        Pest(
            id: "cafe-broca",
            namePt: "Broca-do-café",
            nameEs: "Broca del café",
            scientificName: "Hypothenemus hampei",
            crop: "cafe",
            category: "Coleoptera",
            description: "Praga-chave do cafeeiro mundial. O besouro perfura os frutos e se alimenta do endosperma, causando perdas de peso, qualidade e classificação do café.",
            symptoms: [
                "Orifício circular (~1mm) na coroa do fruto",
                "Presença de pó de perfuração marrom na entrada do orifício",
                "Frutos brocados caem prematuramente",
                "Grãos danificados com galerias internas"
            ],
            lifecycle: "Fêmeas perfuram frutos a partir de 20% de matéria seca. Ciclo de 27-33 dias dentro do fruto. Até 3 gerações por ciclo de frutificação. Adultos sobrevivem em frutos remanescentes.",
            treatmentCultural: "Colheita no pano. Repasse para coleta de frutos de chão e remanescentes. Nível de controle: 3-5% de frutos brocados. Catação de frutos secos.",
            treatmentConventional: "Endossulfan (proibido desde 2013). Clorpirifós (Lorsban 480 BR, 1.5 L/ha, carência 14 dias, classe II). Cipermetrina (Cypermil 250 CE, 200 mL/ha, carência 14 dias, classe II). ⚠️ Verificar registro AGROFIT atualizado.",
            treatmentOrganic: "Beauveria bassiana (Boveril WP) - 1kg/ha, aplicar com 3-5% de broca. Armadilhas com etanol + metanol (monitoramento/captura). Vespa parasitoide Cephalonomia stephanoderis.",
            prevention: "Colheita bem feita sem deixar frutos no chão. Repasse rigoroso. Monitorar quinzenalmente a partir da granação. Armadilhas de feromônio nas bordas.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        ),
        Pest(
            id: "cafe-ferrugem",
            namePt: "Ferrugem-do-cafeeiro",
            nameEs: "Roya del cafeto",
            scientificName: "Hemileia vastatrix",
            crop: "cafe",
            category: "Fungi",
            description: "Doença mais importante do cafeeiro, presente em todas as regiões produtoras do Brasil. Causa desfolha intensa e reduz a produtividade da safra seguinte.",
            symptoms: [
                "Manchas amareladas na face superior das folhas",
                "Pústulas alaranjadas (uredosporos) na face inferior",
                "Desfolha intensa nos meses de agosto-outubro",
                "Seca de ramos em ataques severos"
            ],
            lifecycle: "Uredosporos disseminados por respingos de chuva e vento. Infecção favorecida por 21-25°C e molhamento foliar >6h. Período latente de 25-35 dias.",
            treatmentCultural: "Monitorar mensalmente a incidência. Nível de ação: 5% de incidência em folhas do 3º par. Nutrição adequada com potássio e cálcio. Espaçamento adequado para aeração.",
            treatmentConventional: "Ciproconazol + azoxistrobina (Priori Xtra, 500 mL/ha, carência 30 dias, classe III). Triadimenol via solo (Baytan SC). Oxicloreto de cobre (Recop, 3 kg/ha, carência 14 dias, classe IV).",
            treatmentOrganic: "Calda bordalesa (0.5-1%). Bacillus subtilis (Serenade). Extrato de nim. Compost tea para estimular resistência sistêmica. Cultivares resistentes (Catucaí, Paraíso).",
            prevention: "Plantar cultivares resistentes. Nutrição equilibrada. Poda de rejuvenescimento quando necessário. Aplicação preventiva no início das chuvas.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let algodaoPests: [Pest] = [
        Pest(
            id: "algodao-bicudo",
            namePt: "Bicudo-do-algodoeiro",
            nameEs: "Picudo del algodonero",
            scientificName: "Anthonomus grandis",
            crop: "algodao",
            category: "Coleoptera",
            description: "Principal praga do algodoeiro no Brasil. O adulto perfura botões florais e maçãs para alimentação e oviposição, causando abscisão e perdas severas.",
            symptoms: [
                "Botões florais com orifícios de alimentação e oviposição",
                "Botões amarelecidos com brácteas abertas (formato de baleia)",
                "Queda prematura de botões e maçãs jovens",
                "Maçãs com carimã (podridão interna)"
            ],
            lifecycle: "Fêmeas colocam 1 ovo por botão floral. Ciclo total de 15-20 dias. Diapausa no solo sob restos culturais por até 180 dias. Múltiplas gerações por safra.",
            treatmentCultural: "Destruição obrigatória de soqueira (legislação estadual). Catação e destruição de botões florais caídos. Nível de controle: 5% de botões com orifícios de oviposição.",
            treatmentConventional: "Malation (Malathion 1000 EC, 1.5 L/ha, carência 14 dias, classe III). Endossulfan (uso restrito, verificar). Tiametoxam (Actara 250 WG, 200g/ha, classe III). Rotacionar grupos químicos.",
            treatmentOrganic: "Armadilhas com feromônio Grandlure (monitoramento, 1/5ha). Endoparasitoide Bracon vulgaris. Beauveria bassiana. Neem (Azadiractina) - efeito fagodeterrente.",
            prevention: "Destruição obrigatória de soqueira até data estadual. Armadilhas de borda com feromônio. Plantio na janela ideal. Monitoramento semanal desde o 1º botão floral.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        )
    ]

    static let canaPests: [Pest] = [
        Pest(
            id: "cana-broca",
            namePt: "Broca-da-cana",
            nameEs: "Barrenador de la caña",
            scientificName: "Diatraea saccharalis",
            crop: "cana",
            category: "Lepidoptera",
            description: "Praga mais importante da cana-de-açúcar no Brasil. A lagarta penetra no colmo e forma galerias, prejudicando o fluxo de seiva e favorecendo a entrada de fungos.",
            symptoms: [
                "Orifícios de entrada da lagarta no colmo com serragem",
                "Galerias internas longitudinais no colmo",
                "Inversão sacarose (perda de açúcar por podridão-vermelha)",
                "Colmos quebrados e tombados em infestações severas"
            ],
            lifecycle: "Mariposas colocam 5-50 ovos na face inferior das folhas. Lagartas penetram no colmo após 3-5 dias de alimentação foliar. Ciclo total de 55-65 dias. 3-4 gerações por ciclo da cana.",
            treatmentCultural: "Monitorar índice de infestação (II%): amostrar 10 colmos em 10 pontos por talhão. Nível de controle: II >3%. Eliminar plantas hospedeiras alternativas. Plantio de variedades tolerantes.",
            treatmentConventional: "Clorantraniliprole (Altacor, 75g/ha, classe III) - aplicação dirigida. Flubendiamida (Belt, 100 mL/ha, classe III). Triflumurom (Certero, 50 mL/ha, classe III) - regulador de crescimento.",
            treatmentOrganic: "Cotesia flavipes - principal agente de controle biológico (liberação de 6.000 adultos/ha, 3 liberações). Trichogramma galloi - parasitóide de ovos (100.000/ha). Metarhizium anisopliae para cigarrinha-das-raízes associada.",
            prevention: "Controle biológico com Cotesia como base do MIP. Eliminar restos culturais infectados. Uso de variedades com resistência (fibra dura). Monitoramento intensivo.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        ),
        Pest(
            id: "cana-cigarrinha-raizes",
            namePt: "Cigarrinha-das-raízes",
            nameEs: "Salivazo de la caña",
            scientificName: "Mahanarva fimbriolata",
            crop: "cana",
            category: "Hemiptera",
            description: "Praga de importância crescente com a expansão da colheita mecanizada sem queima. Ninfas sugam raízes e adultos sugam folhas, causando amarelecimento e seca.",
            symptoms: [
                "Espuma branca na base dos colmos (ninfas sugando raízes)",
                "Amarelecimento e seca das folhas centrais",
                "Estrias necróticas irregulares nas folhas (adultos)",
                "Morte de perfilhos em ataques severos"
            ],
            lifecycle: "Ovos em diapausa no solo eclodem com as primeiras chuvas (outubro). Ninfas passam por 5 ínstares em 30-40 dias. Adultos vivem 15-20 dias. 3-4 gerações/ano.",
            treatmentCultural: "Monitorar a partir de outubro com inspeções nas linhas. Nível de controle: 3 ninfas por metro linear. Colheita de cana crua favorece a praga. Irrigação pode antecipar eclosões.",
            treatmentConventional: "Tiametoxam (Actara 250 WG, 200g/ha, classe III). Imidacloprido (Provado 200 SC, 750 mL/ha, classe III). Alpha-cipermetrina para adultos.",
            treatmentOrganic: "Metarhizium anisopliae (1-2 kg/ha de conídios) - principal agente biológico. Aplicar nas primeiras chuvas sobre a palhada. Beauveria bassiana como complemento. Preservar inimigos naturais.",
            prevention: "Metarhizium preventivo sobre palhada no início das chuvas. Controle de daninhas que abrigam ninfas. Variedades com menor suscetibilidade. Enriquecimento de solo para Metarhizium.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let trigoPests: [Pest] = [
        Pest(
            id: "trigo-giberela",
            namePt: "Giberela",
            nameEs: "Fusariosis de la espiga",
            scientificName: "Fusarium graminearum",
            crop: "trigo",
            category: "Fungi",
            description: "Doença mais destrutiva do trigo no sul do Brasil. Causa branqueamento de espigas e produção de micotoxinas (DON, zearalenona) que comprometem a segurança alimentar.",
            symptoms: [
                "Branqueamento prematuro de espiguetas",
                "Coloração rósea-alaranjada (esporulação) nas glumas",
                "Grãos chochos, enrugados e rosados",
                "Contaminação por micotoxinas (DON > 2 ppm)"
            ],
            lifecycle: "Peritécios no solo e restos culturais liberam ascosporos com chuva e vento. Infecção durante antese (florescimento). Período de incubação 3-5 dias em condições úmidas.",
            treatmentCultural: "Rotação de culturas (evitar milho/trigo/cevada em sequência). Nível de ação: monitorar previsão de chuva durante florescimento (72h de umidade = aplicar). Semear cultivares com resistência.",
            treatmentConventional: "Trifloxistrobina + protioconazol (Fox, 500 mL/ha, carência 30 dias). Metconazol (Caramba, 1 L/ha, carência 35 dias). ⚠️ Aplicar no início do florescimento e repetir se houver chuva. Resistência parcial a triazois documentada.",
            treatmentOrganic: "Bacillus subtilis (Serenade) - efeito supressor parcial. Trichoderma harzianum em restos culturais. Rotação e cultivares resistentes são as principais ferramentas.",
            prevention: "Cultivares com resistência moderada (não existem imunes). Rotação evitando gramíneas. Enterrar restos culturais. Aplicação protetora no florescimento se previsão de chuva >72h.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        ),
        Pest(
            id: "trigo-ferrugem-folha",
            namePt: "Ferrugem-da-folha",
            nameEs: "Roya de la hoja",
            scientificName: "Puccinia triticina",
            crop: "trigo",
            category: "Fungi",
            description: "Doença foliar mais comum do trigo no Brasil. Causa pústulas alaranjadas nas folhas, reduzindo a área fotossintética e o peso dos grãos.",
            symptoms: [
                "Pústulas ovaladas alaranjadas dispersas na face superior das folhas",
                "Halos cloróticos ao redor das pústulas",
                "Seca prematura das folhas em ataques severos",
                "Redução do peso de grãos"
            ],
            lifecycle: "Uredosporos disseminados pelo vento de áreas já infectadas. Infecção requer 4-6h de molhamento a 15-22°C. Período latente de 7-10 dias. Múltiplos ciclos.",
            treatmentCultural: "Monitorar semanalmente a partir do perfilhamento. Nível de ação: primeiras pústulas na cultivar suscetível. Usar cultivares resistentes é a melhor ferramenta.",
            treatmentConventional: "Trifloxistrobina + tebuconazol (Nativo, 750 mL/ha, carência 35 dias, classe III). Azoxistrobina + ciproconazol (Priori Xtra, 300 mL/ha, carência 30 dias). Piraclostrobina + epoxiconazol (Opera, 500 mL/ha).",
            treatmentOrganic: "Cultivares resistentes são a principal ferramenta. Calda bordalesa tem efeito limitado. Extratos vegetais em pesquisa. Nutrição adequada com silício.",
            prevention: "Plantar cultivares com resistência de planta adulta (APR). Monitorar boletins de raças prevalentes. Diversificar genes de resistência na lavoura.",
            imageURL: nil,
            severity: .medium,
            isNotifiable: false
        )
    ]

    static let arrozPests: [Pest] = [
        Pest(
            id: "arroz-brusone",
            namePt: "Brusone",
            nameEs: "Piricularia",
            scientificName: "Pyricularia oryzae",
            crop: "arroz",
            category: "Fungi",
            description: "Doença mais importante do arroz no Brasil e no mundo. Afeta folhas, nós, panículas e grãos, podendo causar perdas de até 100% em cultivares suscetíveis.",
            symptoms: [
                "Manchas elípticas com centro cinza e borda marrom nas folhas",
                "Lesões nos nós do colmo causando quebra",
                "Brusone de panícula: pescoço da panícula escurecido",
                "Grãos chochos e manchados"
            ],
            lifecycle: "Conídios disseminados pelo vento. Infecção requer 10-12h de molhamento foliar a 25-28°C. Período latente de 4-6 dias. Sobrevive em sementes e restos culturais.",
            treatmentCultural: "Usar sementes sadias. Evitar excesso de nitrogênio. Espaçamento adequado. Irrigação por submersão reduz a doença foliar. Eliminar restos culturais.",
            treatmentConventional: "Triciclazol (BIM 750 BR, 300g/ha, carência 40 dias). Azoxistrobina + difenoconazol. Tebuconazol (Folicur 200 EC, 750 mL/ha). Aplicar preventivo no emborrachamento.",
            treatmentOrganic: "Trichoderma harzianum. Bacillus subtilis. Silicato de potássio foliar. Cultivares resistentes são a principal ferramenta.",
            prevention: "Cultivares resistentes. Adubação equilibrada (evitar excesso de N). Época de semeadura adequada. Tratamento de sementes.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        ),
        Pest(
            id: "arroz-percevejo",
            namePt: "Percevejo-do-arroz",
            nameEs: "Chinche del arroz",
            scientificName: "Oebalus poecilus",
            crop: "arroz",
            category: "Hemiptera",
            description: "Praga-chave na fase reprodutiva do arroz. Suga grãos em formação causando manchas, chochamento e redução da qualidade.",
            symptoms: [
                "Grãos com manchas escuras de alimentação",
                "Grãos chochos ou parcialmente cheios",
                "Presença de adultos e ninfas nas panículas",
                "Redução da qualidade do grão beneficiado"
            ],
            lifecycle: "Adultos migram de gramíneas hospedeiras. Fêmeas colocam 10-20 ovos em fileiras nas folhas. Ciclo de 30-40 dias. 2-3 gerações por safra.",
            treatmentCultural: "Monitorar a partir da emissão de panículas. Nível de controle: 5 percevejos/m² (amostragem com rede entomológica). Eliminar gramíneas hospedeiras nas bordas.",
            treatmentConventional: "Lambda-cialotrina (Karate Zeon 50 CS, 150 mL/ha). Tiametoxam + lambda-cialotrina (Engeo Pleno S, 200 mL/ha). Aplicar nas panículas em formação.",
            treatmentOrganic: "Telenomus podisi (parasitoide de ovos). Preservar inimigos naturais. Armadilhas luminosas para monitoramento.",
            prevention: "Eliminar plantas hospedeiras. Semear na época recomendada. Colheita no ponto ideal. Monitoramento intensivo na fase reprodutiva.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let feijaoPests: [Pest] = [
        Pest(
            id: "feijao-antracnose",
            namePt: "Antracnose",
            nameEs: "Antracnosis",
            scientificName: "Colletotrichum lindemuthianum",
            crop: "feijao",
            category: "Fungi",
            description: "Doença mais importante do feijoeiro no Brasil. Afeta toda a parte aérea, causando lesões em folhas, caules, pecíolos e vagens com perdas de até 100%.",
            symptoms: [
                "Lesões deprimidas marrom-escuras nas vagens com centro rosado",
                "Nervuras das folhas com coloração marrom-avermelhada na face inferior",
                "Manchas necróticas arredondadas nas folhas",
                "Sementes manchadas e descoloridas"
            ],
            lifecycle: "Transmitida por sementes infectadas. Disseminação por respingos de chuva. Infecção favorecida por 13-26°C e alta umidade. Período de incubação de 7-10 dias.",
            treatmentCultural: "Usar sementes certificadas. Rotação de culturas por 2-3 anos. Eliminar restos culturais. Evitar cultivo em áreas com histórico da doença.",
            treatmentConventional: "Azoxistrobina + difenoconazol (Amistar Top, 300 mL/ha). Tiofanato-metílico (Cercobin 700 WP, 700g/ha). Aplicar preventivamente no estádio V4.",
            treatmentOrganic: "Trichoderma spp. Bacillus subtilis. Calda bordalesa (1%). Cultivares resistentes (verificar raças prevalentes na região).",
            prevention: "Sementes sadias. Cultivares resistentes. Rotação com gramíneas. Espaçamento adequado para ventilação.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        ),
        Pest(
            id: "feijao-mosca-branca",
            namePt: "Mosca-branca",
            nameEs: "Mosca blanca",
            scientificName: "Bemisia tabaci",
            crop: "feijao",
            category: "Hemiptera",
            description: "Praga polífaga que causa danos diretos pela sucção de seiva e indiretos pela transmissão do vírus do mosaico-dourado (BGMV).",
            symptoms: [
                "Amarelecimento intenso das folhas (mosaico-dourado)",
                "Folhas com aspecto encarquilhado e deformado",
                "Fumagina (fungo negro) sobre secreções da mosca",
                "Plantas raquíticas com redução de vagens"
            ],
            lifecycle: "Ciclo de 21-28 dias. Fêmeas colocam 100-300 ovos na face inferior das folhas. Adultos são pequenos (1mm) e brancos. Múltiplas gerações por safra.",
            treatmentCultural: "Plantio na época menos favorável. Eliminação de plantas hospedeiras. Uso de barreiras vivas. Monitorar com armadilhas amarelas adesivas.",
            treatmentConventional: "Tiametoxam (Actara 250 WG, 100g/ha). Imidacloprido (Provado 200 SC, 250 mL/ha). Piriproxifem (Tiger 100 EC, 250 mL/ha) - regulador de crescimento.",
            treatmentOrganic: "Beauveria bassiana. Óleo de neem (Azadiractina). Encarsia formosa (parasitoide). Sabão de potássio.",
            prevention: "Época de plantio (evitar 2ª safra tardia). Variedades resistentes ao mosaico-dourado. Eliminação de tiguera e hospedeiros alternativos.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let batataPests: [Pest] = [
        Pest(
            id: "batata-requeima",
            namePt: "Requeima",
            nameEs: "Tizón tardío",
            scientificName: "Phytophthora infestans",
            crop: "batata",
            category: "Fungi",
            description: "Doença mais devastadora da batata no mundo. Responsável pela Grande Fome Irlandesa (1845). Pode destruir uma lavoura em poucos dias sob condições favoráveis.",
            symptoms: [
                "Manchas verde-escuras a marrons de aspecto encharcado nas folhas",
                "Esporulação branca na face inferior das lesões",
                "Hastes com lesões escuras e aquosas",
                "Tubérculos com podridão parda firme"
            ],
            lifecycle: "Esporangios disseminados pelo vento e chuva. Infecção favorecida por T < 20°C e umidade > 90%. Período latente de 3-5 dias. Epidemias explosivas.",
            treatmentCultural: "Monitoramento diário em períodos úmidos. Irrigação por gotejamento (evitar aspersão). Amontoa adequada para proteger tubérculos. Destruição de fontes de inóculo.",
            treatmentConventional: "Cimoxanil + mancozebe (Curzate BR, 2.5 kg/ha). Metalaxil-M + mancozebe (Ridomil Gold MZ, 2.5 kg/ha). Fluazinam (Frowncide 500 SC, 1 L/ha). Rotacionar princípios ativos.",
            treatmentOrganic: "Calda bordalesa (1%). Fosfito de potássio. Trichoderma spp. Cultivares com resistência horizontal.",
            prevention: "Cultivares resistentes. Sementes sadias. Destruição de restos culturais. Monitorar alertas de requeima (modelos epidemiológicos).",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        )
    ]

    static let tomatePests: [Pest] = [
        Pest(
            id: "tomate-traca",
            namePt: "Traça-do-tomateiro",
            nameEs: "Polilla del tomate",
            scientificName: "Tuta absoluta",
            crop: "tomate",
            category: "Lepidoptera",
            description: "Praga-chave do tomateiro na América do Sul. Larvas minadoras causam galerias em folhas, hastes e frutos, com perdas de até 100% se não controlada.",
            symptoms: [
                "Minas irregulares translúcidas nas folhas",
                "Galerias em hastes e pecíolos",
                "Orifícios de entrada nos frutos próximo ao cálice",
                "Frutos com galerias internas e excrementos"
            ],
            lifecycle: "Ciclo de 26-38 dias. Fêmeas colocam 40-260 ovos. 4 ínstares larvais. Pupa no solo ou na planta. Até 12 gerações/ano em ambiente protegido.",
            treatmentCultural: "Armadilhas de feromônio (Delta trap). Nível de controle: 45 adultos/armadilha/semana. Tutoria e poda adequadas. Eliminação de plantas hospedeiras.",
            treatmentConventional: "Clorantraniliprole (Premio, 75 mL/ha). Spinosade (Tracer, 100 mL/ha). Indoxacarbe (Avatar, 200 mL/ha). Rotacionar mecanismos de ação.",
            treatmentOrganic: "Bacillus thuringiensis var. kurstaki. Trichogramma pretiosum (200.000/ha semanal). Neem (Azadiractina). Armadilhas com luz.",
            prevention: "Feromônio para monitoramento e confusão sexual. Telas antiafídeos em estufas. Eliminação de restos culturais. Rotação de culturas.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        ),
        Pest(
            id: "tomate-requeima",
            namePt: "Requeima do tomateiro",
            nameEs: "Tizón tardío del tomate",
            scientificName: "Phytophthora infestans",
            crop: "tomate",
            category: "Fungi",
            description: "Doença extremamente destrutiva em tomateiro, especialmente em períodos frios e úmidos. Pode devastar a lavoura em poucos dias.",
            symptoms: [
                "Manchas encharcadas verde-escuras nas folhas",
                "Esporulação branca na face inferior",
                "Hastes com lesões escuras",
                "Frutos com podridão firme marrom"
            ],
            lifecycle: "Esporangios disseminados pelo vento. Infecção com T 12-22°C e umidade >90%. Ciclo muito rápido (3-5 dias). Epidemias explosivas.",
            treatmentCultural: "Evitar irrigação por aspersão. Espaçamento amplo. Monitoramento intensivo em períodos úmidos. Eliminar plantas doentes imediatamente.",
            treatmentConventional: "Cimoxanil + mancozebe (Curzate BR). Metalaxil-M + mancozebe (Ridomil Gold). Dimetomorfe + clorotalonil. Aplicações preventivas a cada 5-7 dias.",
            treatmentOrganic: "Calda bordalesa. Fosfito de potássio. Trichoderma. Cultivares com resistência.",
            prevention: "Cultivares resistentes. Estrutura de proteção (estufas). Drenagem adequada. Monitorar previsão de tempo.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: false
        )
    ]

    static let mandiocaPests: [Pest] = [
        Pest(
            id: "mandioca-mosca-branca",
            namePt: "Mosca-branca da mandioca",
            nameEs: "Mosca blanca de la yuca",
            scientificName: "Aleurothrixus aepim",
            crop: "mandioca",
            category: "Hemiptera",
            description: "Praga importante da mandioca no Nordeste brasileiro. Suga seiva das folhas causando debilitamento da planta e transmissão de vírus.",
            symptoms: [
                "Amarelecimento e encarquilhamento das folhas",
                "Fumagina sobre exsudatos açucarados",
                "Desfolha em ataques severos",
                "Redução no tamanho das raízes"
            ],
            lifecycle: "Ciclo de 25-35 dias. Ovos na face inferior das folhas. Ninfas sésseis sugam a seiva. Populações maiores no período seco.",
            treatmentCultural: "Plantio na época das chuvas. Espaçamento adequado. Eliminação de plantas infectadas por vírus. Uso de manivas-semente sadias.",
            treatmentConventional: "Tiametoxam (Actara 250 WG). Imidacloprido. Aplicar somente em altas infestações.",
            treatmentOrganic: "Beauveria bassiana. Óleo de neem. Sabão de potássio. Inimigos naturais (Encarsia spp.).",
            prevention: "Variedades tolerantes. Plantio em época adequada. Consórcio com outras culturas. Manejo da vegetação espontânea.",
            imageURL: nil,
            severity: .medium,
            isNotifiable: false
        )
    ]

    static let citrosPests: [Pest] = [
        Pest(
            id: "citros-greening",
            namePt: "Greening (HLB)",
            nameEs: "Huanglongbing",
            scientificName: "Candidatus Liberibacter asiaticus",
            crop: "citros",
            category: "Bacteria",
            description: "Doença mais devastadora da citricultura mundial. Transmitida pelo psilídeo Diaphorina citri. Sem cura - plantas infectadas devem ser erradicadas.",
            symptoms: [
                "Amarelecimento assimétrico de ramos (dragão amarelo)",
                "Frutos assimétricos, pequenos e com sementes abortadas",
                "Folhas com mosqueado amarelo assimétrico",
                "Declínio progressivo e morte da planta"
            ],
            lifecycle: "Bactéria floemática transmitida pelo psilídeo Diaphorina citri. Período de incubação de 6-12 meses. Sem transmissão por sementes. Disseminação por mudas infectadas.",
            treatmentCultural: "NÃO HÁ CURA. Erradicação de plantas sintomáticas é obrigatória (legislação). Controle do psilídeo vetor. Inspeções trimestrais.",
            treatmentConventional: "Controle do vetor: Imidacloprido (solo/tronco). Dimetoato (foliar). Tiametoxam. Programa regional de controle é essencial.",
            treatmentOrganic: "Tamarixia radiata (parasitoide do psilídeo). Beauveria bassiana. Manejo integrado do psilídeo.",
            prevention: "Mudas certificadas de viveiros protegidos. Monitoramento do psilídeo com armadilhas. Erradicação imediata de plantas doentes. Barreiras vegetais.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: true
        )
    ]

    static let uvaPests: [Pest] = [
        Pest(
            id: "uva-mildio",
            namePt: "Míldio",
            nameEs: "Mildiú",
            scientificName: "Plasmopara viticola",
            crop: "uva",
            category: "Fungi",
            description: "Doença mais importante da videira em regiões úmidas do Brasil. Ataca folhas, ramos e cachos, causando desfolha e perda total de cachos.",
            symptoms: [
                "Manchas oleosas verde-claras na face superior das folhas",
                "Esporulação branca algodonosa na face inferior",
                "Necrose e queda de folhas",
                "Cachos mumificados com esporulação branca"
            ],
            lifecycle: "Oósporos sobrevivem no solo e folhas caídas. Zoósporos liberados com chuva. Infecção requer molhamento e T 18-25°C. Período latente de 4-10 dias.",
            treatmentCultural: "Poda verde para aeração. Desfolha na zona de cachos. Controle de mato. Drenagem adequada. Sistema de condução arejado.",
            treatmentConventional: "Metalaxil-M + mancozebe (Ridomil Gold MZ). Cimoxanil + mancozebe. Fosetil-Al (Aliette). Aplicar preventivamente antes das chuvas.",
            treatmentOrganic: "Calda bordalesa (0.5-1%). Fosfito de potássio. Trichoderma. Cultivares resistentes (Isabel, Niágara).",
            prevention: "Cultivares tolerantes. Sistema de condução elevado. Poda adequada. Aplicação preventiva antes de períodos chuvosos.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let bananaPests: [Pest] = [
        Pest(
            id: "banana-sigatoka",
            namePt: "Sigatoka-negra",
            nameEs: "Sigatoka negra",
            scientificName: "Mycosphaerella fijiensis",
            crop: "banana",
            category: "Fungi",
            description: "Doença foliar mais destrutiva da bananeira. Causa necrose foliar severa, redução de produtividade e amadurecimento precoce dos frutos.",
            symptoms: [
                "Estrias marrom-escuras a negras nas folhas",
                "Necrose extensa das folhas mais velhas",
                "Frutos amadurecendo prematuramente (climatério antecipado)",
                "Cachos pequenos com pencas reduzidas"
            ],
            lifecycle: "Conídios e ascosporos disseminados pelo vento e chuva. Infecção requer 12h de molhamento a 25-28°C. Período latente de 14-21 dias.",
            treatmentCultural: "Desfolha sanitária (remover folhas doentes). Espaçamento amplo. Desbaste de perfilhos. Drenagem. Nutrição equilibrada com K e Ca.",
            treatmentConventional: "Propiconazol (Tilt 250 EC). Azoxistrobina. Mancozebe em óleo mineral. Rotacionar grupos químicos. Aplicação aérea em grandes áreas.",
            treatmentOrganic: "Trichoderma spp. Calda bordalesa. Compostagem como cobertura. Cultivares resistentes (FHIA-18, BRS Platina).",
            prevention: "Cultivares resistentes. Desfolha sanitária regular. Nutrição adequada. Manejo de água e drenagem.",
            imageURL: nil,
            severity: .critical,
            isNotifiable: true
        )
    ]

    static let sorgoPests: [Pest] = [
        Pest(
            id: "sorgo-pulgao",
            namePt: "Pulgão-verde",
            nameEs: "Pulgón verde",
            scientificName: "Schizaphis graminum",
            crop: "sorgo",
            category: "Hemiptera",
            description: "Principal praga do sorgo no Brasil. Suga seiva e injeta toxinas que causam clorose e necrose foliar, podendo matar plantas jovens.",
            symptoms: [
                "Manchas avermelhadas ou amareladas nas folhas (toxemia)",
                "Colônias verde-claras na face inferior das folhas",
                "Fumagina sobre exsudatos",
                "Morte de plantas jovens em infestações severas"
            ],
            lifecycle: "Reprodução assexuada (partenogênese). Colônias crescem exponencialmente em condições secas e quentes. Ciclo de 7-10 dias.",
            treatmentCultural: "Monitorar semanalmente. Nível de controle: colônias em expansão com mais de 20% das plantas colonizadas. Híbridos com resistência.",
            treatmentConventional: "Tiametoxam (Actara 250 WG, 100g/ha). Imidacloprido. Lambda-cialotrina + tiametoxam.",
            treatmentOrganic: "Aphidius colemani (parasitoide). Chrysoperla externa (predador). Beauveria bassiana. Óleo de neem.",
            prevention: "Híbridos resistentes. Plantio na época adequada. Manter inimigos naturais. Evitar estresse hídrico.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let amendoimPests: [Pest] = [
        Pest(
            id: "amendoim-cercosporiose",
            namePt: "Cercosporiose",
            nameEs: "Cercosporiosis",
            scientificName: "Cercosporidium personatum",
            crop: "amendoim",
            category: "Fungi",
            description: "Doença foliar mais comum do amendoim. Causa manchas e desfolha, reduzindo a área fotossintética e o peso dos grãos.",
            symptoms: [
                "Manchas circulares escuras (2-7mm) nas folhas",
                "Desfolha prematura do terço inferior",
                "Esporulação cinza-escura na face inferior das lesões",
                "Redução do tamanho e peso das vagens"
            ],
            lifecycle: "Conídios disseminados por respingos de chuva e vento. Infecção favorecida por T 25-30°C e umidade alta. Período latente de 10-14 dias.",
            treatmentCultural: "Rotação de culturas por 2 anos. Eliminar restos culturais. Espaçamento adequado. Evitar plantio tardio.",
            treatmentConventional: "Clorotalonil (Daconil 500, 2 L/ha). Azoxistrobina + ciproconazol. Tebuconazol. Aplicar a partir dos 35 dias após emergência.",
            treatmentOrganic: "Trichoderma. Calda bordalesa. Cultivares com resistência parcial. Adubação foliar com micronutrientes.",
            prevention: "Rotação com gramíneas. Cultivares tolerantes. Plantio na época recomendada. Manejo de restos culturais.",
            imageURL: nil,
            severity: .medium,
            isNotifiable: false
        )
    ]

    static let girassolPests: [Pest] = [
        Pest(
            id: "girassol-mofo-branco",
            namePt: "Mofo-branco",
            nameEs: "Moho blanco",
            scientificName: "Sclerotinia sclerotiorum",
            crop: "girassol",
            category: "Fungi",
            description: "Doença mais importante do girassol no Brasil. Causa podridão do capítulo, caule e raízes. Escleródios sobrevivem no solo por anos.",
            symptoms: [
                "Podridão mole aquosa no capítulo com micélio branco algodonoso",
                "Escleródios negros dentro do capítulo e caule",
                "Murcha e tombamento de plantas (podridão basal)",
                "Apodrecimento de sementes no capítulo"
            ],
            lifecycle: "Escleródios germinam produzindo apotécios que liberam ascosporos. Infecção por pétalas senescentes que caem no capítulo. Favorecida por T 15-25°C e alta umidade.",
            treatmentCultural: "Rotação com gramíneas por 3-4 anos. Espaçamento amplo. Evitar irrigação por aspersão no florescimento. Incorporação profunda de restos culturais.",
            treatmentConventional: "Fluazinam (Frowncide 500 SC). Procimidona (Sumilex 500 WP). Aplicar no início do florescimento (R4-R5).",
            treatmentOrganic: "Trichoderma harzianum (aplicação no solo). Coniothyrium minitans (parasita de escleródios). Manejo cultural é essencial.",
            prevention: "Rotação longa com gramíneas. Evitar áreas com histórico. Espaçamento adequado. Época de semeadura para evitar florescimento em período chuvoso.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]

    static let cebolaPests: [Pest] = [
        Pest(
            id: "cebola-tripes",
            namePt: "Tripes",
            nameEs: "Trips de la cebolla",
            scientificName: "Thrips tabaci",
            crop: "cebola",
            category: "Thysanoptera",
            description: "Praga-chave da cebola no Brasil. Raspa as folhas e suga a seiva, causando prateamento, redução da área foliar e porta de entrada para doenças.",
            symptoms: [
                "Folhas com aspecto prateado ou esbranquiçado",
                "Estrias e manchas cloróticas nas folhas",
                "Deformação e encurvamento foliar em ataques severos",
                "Bulbos pequenos e mal formados"
            ],
            lifecycle: "Ciclo de 15-20 dias. Fêmeas inserem ovos no tecido foliar. Ninfas e adultos se alimentam nas axilas das folhas. Populações aumentam no tempo seco.",
            treatmentCultural: "Irrigação por aspersão reduz populações. Monitoramento com batida em papel branco. Nível de controle: 15-20 tripes/planta. Eliminação de restos culturais.",
            treatmentConventional: "Espinosade (Tracer, 100 mL/ha). Acefato (Orthene 750 BR). Lambda-cialotrina. Rotacionar princípios ativos.",
            treatmentOrganic: "Beauveria bassiana. Óleo de neem. Sabão de potássio. Orius insidiosus (percevejo predador).",
            prevention: "Irrigação adequada (aspersão). Eliminação de plantas hospedeiras. Cultivares com folhas cerosas. Plantio em época com menor pressão.",
            imageURL: nil,
            severity: .high,
            isNotifiable: false
        )
    ]
}
