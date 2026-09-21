import AppKit
import SwiftUI

struct TokenRequestsView: View {
    @EnvironmentObject private var session: AdminSession
    @StateObject private var model = CollectionModel()
    @State private var note = ""
    @State private var verifiedHKD = ""
    @State private var busyId = ""
    var body: some View {
        VStack(alignment: .leading) {
            Text("代幣審批").font(.largeTitle.bold()).padding([.top, .horizontal], 24)
            Text("重複審批會由伺服器拒絕；批核同入帳會以同一交易完成。")
                .foregroundStyle(.secondary).padding(.horizontal, 24)
            List(model.items.filter { ["pending", "awaiting_upload"].contains($0.fields["status"] as? String ?? "") }) { item in
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Text(item.title).font(.headline); Spacer(); Text(item.id).font(.caption.monospaced()) }
                    Text("申請代幣：\(item.fields["amount"] ?? 0) · 狀態：\(item.fields["status"] ?? "-")")
                    if let proof = item.fields["proofUrl"] as? String, let url = URL(string: proof), !proof.isEmpty {
                        Button("查看付款證明") { NSWorkspace.shared.open(url) }
                    }
                    HStack {
                        TextField("管理員備註", text: $note)
                        TextField("核實 HKD", text: $verifiedHKD).frame(width: 110)
                        Button("拒絕", role: .destructive) { Task { await review(item, "rejected") } }
                        Button("批核") { Task { await review(item, "approved") } }.buttonStyle(.borderedProminent).tint(.red)
                    }.disabled(!busyId.isEmpty)
                }.padding(.vertical, 8)
            }
        }.task { await load() }
    }
    private func load() async { await model.load(api: session.api, collection: "tokenRequests", orderField: "createdAt") }
    private func review(_ item: AdminDocument, _ decision: String) async {
        busyId = item.id; defer { busyId = "" }
        do { try await session.api.reviewTokenRequest(id: item.id, decision: decision, note: note, hkd: Double(verifiedHKD) ?? 0); await load() }
        catch { model.error = error.localizedDescription }
    }
}

struct ShippingView: View {
    @EnvironmentObject private var session: AdminSession
    @StateObject private var model = CollectionModel()
    @State private var tracking: [String: String] = [:]
    var body: some View {
        VStack(alignment: .leading) {
            Text("配送管理").font(.largeTitle.bold()).padding([.top, .horizontal], 24)
            Text("待安排配送 → 正在配送 → 已經送到").foregroundStyle(.secondary).padding(.horizontal, 24)
            List(model.items.filter { ($0.fields["shippingRequested"] as? Bool) == true }) { item in
                HStack(spacing: 14) {
                    VStack(alignment: .leading) {
                        Text(item.title).font(.headline)
                        Text(item.fields["deliveryStatus"] as? String ?? "arranging").foregroundStyle(.secondary)
                    }
                    Spacer()
                    TextField("順豐運單", text: Binding(
                        get: { tracking[item.id, default: item.fields["trackingNumber"] as? String ?? ""] },
                        set: { tracking[item.id] = $0 }
                    )).frame(width: 180)
                    Button("待安排") { Task { await update(item, "arranging") } }
                    Button("正在配送") { Task { await update(item, "in_transit") } }
                    Button("已經送到") { Task { await update(item, "delivered") } }.buttonStyle(.borderedProminent).tint(.red)
                }.padding(.vertical, 6)
            }
        }.task { await load() }
    }
    private func load() async { await model.load(api: session.api, collection: "drawRecords", orderField: "createdAt") }
    private func update(_ item: AdminDocument, _ status: String) async {
        do { try await session.api.setShipping(id: item.id, status: status, trackingNumber: tracking[item.id] ?? ""); await load() }
        catch { model.error = error.localizedDescription }
    }
}
