import SwiftUI

@MainActor
final class CollectionModel: ObservableObject {
    @Published var items: [AdminDocument] = []
    @Published var loading = false
    @Published var error = ""

    func load(api: AdminAPI, collection: String, orderField: String) async {
        loading = true; error = ""
        do { items = try await api.list(collection, orderField: orderField) }
        catch { self.error = error.localizedDescription }
        loading = false
    }
}

struct CollectionView: View {
    @EnvironmentObject private var session: AdminSession
    @StateObject private var model = CollectionModel()
    @State private var selection: AdminDocument.ID?
    @State private var search = ""
    let title: String
    let collection: String
    var orderField = ""
    var readOnly = false

    private var filtered: [AdminDocument] {
        guard !search.isEmpty else { return model.items }
        return model.items.filter { $0.title.localizedCaseInsensitiveContains(search) || $0.id.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).font(.largeTitle.bold())
                Spacer()
                TextField("搜尋", text: $search).textFieldStyle(.roundedBorder).frame(width: 220)
                Button { Task { await reload() } } label: { Image(systemName: "arrow.clockwise") }
            }.padding(24)
            if model.loading { ProgressView().padding() }
            if !model.error.isEmpty { Text(model.error).foregroundStyle(.red).padding() }
            List(filtered, selection: $selection) { item in
                NavigationLink(value: item.id) {
                    VStack(alignment: .leading) {
                        Text(item.title).font(.headline)
                        Text(item.subtitle).font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                }
            }
            .navigationDestination(for: String.self) { id in
                if let item = model.items.first(where: { $0.id == id }) {
                    DocumentDetailView(item: item, collection: collection, readOnly: readOnly) { Task { await reload() } }
                }
            }
        }.task { await reload() }
    }

    private func reload() async { await model.load(api: session.api, collection: collection, orderField: orderField) }
}

private struct DocumentDetailView: View {
    @EnvironmentObject private var session: AdminSession
    let item: AdminDocument
    let collection: String
    let readOnly: Bool
    let onSaved: () -> Void
    @State private var json = ""
    @State private var message = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(item.title).font(.title.bold())
            Text(item.id).font(.caption.monospaced()).foregroundStyle(.secondary)
            TextEditor(text: $json).font(.body.monospaced()).disabled(readOnly)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
            if !message.isEmpty { Text(message).foregroundStyle(message == "已儲存" ? .green : .red) }
            if !readOnly {
                Button("儲存修改") { Task { await save() } }.buttonStyle(.borderedProminent).tint(.red)
            }
        }.padding(28).onAppear { json = Self.prettyJSON(item.fields) }
    }

    private func save() async {
        do {
            let data = Data(json.utf8)
            guard let fields = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw EditorError.invalidJSON }
            let alwaysProtected = ["id", "createdAt", "updatedAt", "createdBy", "updatedBy"]
            let recordProtected = ["uid", "tokenCost", "tokenRefund", "convertedToTokens", "convertedAt", "lastTokenGrantRequestId"]
            let protected = Set(alwaysProtected + (collection == "drawRecords" ? recordProtected : []))
            let original = item.fields.filter { !protected.contains($0.key) }
            let editable = fields.filter { !protected.contains($0.key) }.filter { key, value in
                !Self.jsonEqual(value, original[key])
            }
            guard !editable.isEmpty else { message = "沒有需要儲存的修改"; return }
            try await session.api.write(collection: collection, id: item.id, fields: editable)
            message = "已儲存"; onSaved()
        } catch { message = error.localizedDescription }
    }

    private static func jsonEqual(_ left: Any, _ right: Any?) -> Bool {
        guard let right,
              JSONSerialization.isValidJSONObject(["value": left]),
              JSONSerialization.isValidJSONObject(["value": right]),
              let leftData = try? JSONSerialization.data(withJSONObject: ["value": left], options: [.sortedKeys]),
              let rightData = try? JSONSerialization.data(withJSONObject: ["value": right], options: [.sortedKeys]) else { return false }
        return leftData == rightData
    }

    private static func prettyJSON(_ object: [String: Any]) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}

private enum EditorError: LocalizedError {
    case invalidJSON
    var errorDescription: String? { "JSON 格式不正確。" }
}
