import FirebaseFunctions
import Foundation

struct AdminDocument: Identifiable {
    let id: String
    let fields: [String: Any]
    var title: String {
        for key in ["name", "title", "username", "code", "email"] {
            if let value = fields[key] as? String, !value.isEmpty { return value }
        }
        return id
    }
    var subtitle: String {
        for key in ["status", "category", "uid", "deliveryStatus"] {
            if let value = fields[key] { return "\(value)" }
        }
        return id
    }
}

final class AdminAPI {
    private let functions = Functions.functions(region: "asia-east2")

    func call(_ name: String, data: [String: Any] = [:]) async throws -> [String: Any] {
        let result = try await functions.httpsCallable(name).call(data)
        guard let dictionary = result.data as? [String: Any] else { return [:] }
        return dictionary
    }

    func list(_ collection: String, orderField: String = "", limit: Int = 200) async throws -> [AdminDocument] {
        let result = try await call("adminList", data: [
            "collection": collection, "orderField": orderField, "limit": limit,
        ])
        let items = result["items"] as? [[String: Any]] ?? []
        return items.compactMap { item in
            guard let id = item["id"] as? String else { return nil }
            return AdminDocument(id: id, fields: item)
        }
    }

    func write(collection: String, id: String, fields: [String: Any], mode: String = "upsert") async throws {
        _ = try await call("adminWrite", data: [
            "collection": collection, "documentId": id, "data": fields, "mode": mode,
        ])
    }

    func reviewTokenRequest(id: String, decision: String, note: String, hkd: Double) async throws {
        _ = try await call("adminReviewTokenRequest", data: [
            "requestId": id, "decision": decision, "adminNote": note, "verifiedHkdAmount": hkd,
        ])
    }

    func setShipping(id: String, status: String, trackingNumber: String) async throws {
        _ = try await call("adminSetShippingStatus", data: [
            "recordId": id, "deliveryStatus": status, "trackingNumber": trackingNumber,
        ])
    }
}
