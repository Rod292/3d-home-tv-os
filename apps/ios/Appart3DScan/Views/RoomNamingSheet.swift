import SwiftUI

/// Après chaque pièce : la nommer, puis enchaîner ou terminer.
struct RoomNamingSheet: View {
    let roomNumber: Int
    let alreadyUsed: [String]
    var onAction: (Action, String) -> Void

    enum Action { case scanAnother, finish, redo }

    @State private var name = ""
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title2)
                        .foregroundStyle(Theme.sage)
                    Text("Pièce \(roomNumber) capturée")
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(Theme.ink)
                }
                Text("Comment s'appelle cette pièce ?")
                    .font(.subheadline)
                    .foregroundStyle(Theme.inkSoft)

                TextField("Nom de la pièce", text: $name)
                    .textInputAutocapitalization(.sentences)
                    .focused($focused)
                    .padding(14)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Theme.creamDeep, lineWidth: 1))

                FlowLayout(spacing: 8) {
                    ForEach(FrenchLabels.roomSuggestions, id: \.self) { suggestion in
                        Button { name = suggestedName(suggestion) } label: {
                            Text(suggestion)
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .foregroundStyle(name == suggestion ? .white : Theme.slate)
                                .background(name == suggestion ? Theme.slate : Theme.slate.opacity(0.12),
                                            in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }

                VStack(spacing: 10) {
                    Button { onAction(.scanAnother, name) } label: {
                        Label("Scanner une autre pièce", systemImage: "plus.viewfinder")
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button { onAction(.finish, name) } label: {
                        Label("Terminer l'appartement", systemImage: "checkmark")
                    }
                    .buttonStyle(PrimaryButtonStyle(color: Theme.sage))

                    Button(role: .destructive) { onAction(.redo, name) } label: {
                        Label("Refaire cette pièce", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(SecondaryButtonStyle(color: Theme.terracotta))
                }
                .padding(.top, 6)
            }
            .padding(24)
        }
        .background(Theme.cream.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled()
    }

    /// « Chambre » déjà utilisée → « Chambre 2 ».
    private func suggestedName(_ base: String) -> String {
        guard alreadyUsed.contains(base) else { return base }
        var index = 2
        while alreadyUsed.contains("\(base) \(index)") { index += 1 }
        return "\(base) \(index)"
    }
}

#Preview {
    RoomNamingSheet(roomNumber: 2, alreadyUsed: ["Séjour"]) { _, _ in }
}
