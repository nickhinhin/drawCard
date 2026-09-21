import SwiftUI

enum AdminSection: String, CaseIterable, Identifiable {
    case dashboard = "總覽"
    case cards = "卡牌庫"
    case rooms = "直播場次"
    case results = "賽果及派卡"
    case tokens = "代幣審批"
    case shipping = "配送"
    case promos = "推廣碼"
    case settings = "系統設定"
    case homepage = "公開頁設定"
    case audit = "審計紀錄"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .dashboard: "chart.bar"
        case .cards: "rectangle.stack"
        case .rooms: "play.rectangle"
        case .results: "list.bullet.clipboard"
        case .tokens: "bolt.circle"
        case .shipping: "shippingbox"
        case .promos: "ticket"
        case .settings: "gearshape"
        case .homepage: "photo.on.rectangle"
        case .audit: "checkmark.shield"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: AdminSession
    var body: some View {
        switch session.state {
        case .signedOut: LoginView(message: nil)
        case .checking: ProgressView("正在驗證管理員權限…").controlSize(.large)
        case .denied(let message): LoginView(message: message)
        case .ready: AdminShell()
        }
    }
}

private struct LoginView: View {
    @EnvironmentObject private var session: AdminSession
    let message: String?
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "shield.lefthalf.filled").font(.system(size: 64)).foregroundStyle(.red)
            Text("LiveDraw Admin").font(.largeTitle.bold())
            Text("只限獲授權 Google 管理員帳戶使用").foregroundStyle(.secondary)
            if let message { Text(message).foregroundStyle(.red).multilineTextAlignment(.center) }
            Button("使用 Google 登入") { Task { await session.signIn() } }
                .buttonStyle(.borderedProminent).controlSize(.large).tint(.red)
        }.frame(maxWidth: .infinity, maxHeight: .infinity).padding(48)
    }
}

private struct AdminShell: View {
    @EnvironmentObject private var session: AdminSession
    @State private var selection: AdminSection? = .dashboard
    var body: some View {
        NavigationSplitView {
            List(AdminSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: section.icon).tag(section)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(session.email).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Button("登出", role: .destructive) { session.signOut() }
                }.padding()
            }
            .navigationTitle("管理後台")
        } detail: {
            switch selection ?? .dashboard {
            case .dashboard: DashboardView()
            case .cards: CollectionView(title: "卡牌庫", collection: "cards", orderField: "createdAt")
            case .rooms: CollectionView(title: "直播場次", collection: "draws", orderField: "createdAt")
            case .results: CollectionView(title: "賽果及派卡", collection: "drawRecords", orderField: "createdAt")
            case .tokens: TokenRequestsView()
            case .shipping: ShippingView()
            case .promos: CollectionView(title: "推廣碼", collection: "promoCodes")
            case .settings: CollectionView(title: "系統設定", collection: "settings")
            case .homepage: CollectionView(title: "公開頁設定", collection: "publicSiteSettings")
            case .audit: CollectionView(title: "審計紀錄", collection: "adminAuditLogs", orderField: "createdAt", readOnly: true)
            }
        }
    }
}

private struct DashboardView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("管理總覽").font(.largeTitle.bold())
            Text("所有管理修改只會經受保護的伺服器執行，並自動留下不可由 App 修改的審計紀錄。")
                .foregroundStyle(.secondary)
            HStack(spacing: 16) {
                StatusCard(icon: "person.badge.shield.checkmark", title: "身份", value: "已驗證")
                StatusCard(icon: "checkmark.shield", title: "App Check", value: "已啟用")
                StatusCard(icon: "doc.text.magnifyingglass", title: "審計", value: "自動記錄")
            }
            Spacer()
        }.padding(32)
    }
}

private struct StatusCard: View {
    let icon: String, title: String, value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon).font(.title).foregroundStyle(.red)
            Text(title).foregroundStyle(.secondary)
            Text(value).font(.title2.bold())
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 14))
    }
}
