import Foundation
import Combine

// MARK: - Models

struct StravaConnection: Codable {
    let connected: Bool
    let athleteName: String?
    let athleteId: String?
    let lastSync: String?
    let tokenExpired: Bool?
    
    enum CodingKeys: String, CodingKey {
        case connected
        case athleteName
        case athleteId
        case lastSync
        case tokenExpired
    }
}

struct StravaPublishResult: Codable {
    let success: Bool
    let uploadId: Int?
    let activityId: String?
    let stravaUrl: String?
    let message: String?
    let error: String?
}

struct StravaActivity: Codable, Identifiable {
    let id: String
    let name: String
    let distance: Double
    let duration: Int
    let completedAt: String
    let stravaUrl: String
    let stravaId: String
}

struct StravaActivitiesResponse: Codable {
    let count: Int
    let activities: [StravaActivity]
}

// MARK: - ViewModel

class StravaViewModel: ObservableObject {
    
    @Published var connectionStatus = StravaConnection(
        connected: false,
        athleteName: nil,
        athleteId: nil,
        lastSync: nil,
        tokenExpired: false
    )
    
    @Published var publishResult: StravaPublishResult?
    @Published var stravaActivities: [StravaActivity] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let apiService: APIService
    
    init(apiService: APIService) {
        self.apiService = apiService
        checkStravaConnection()
    }
    
    // MARK: - Public Methods
    
    /// Check current Strava connection status
    @MainActor
    func checkStravaConnection() {
        Task {
            do {
                isLoading = true
                let status = try await apiService.get(
                    "/api/strava/connection-status",
                    responseType: StravaConnection.self
                )
                self.connectionStatus = status
                self.errorMessage = nil
            } catch {
                self.errorMessage = "Failed to check Strava connection: \(error.localizedDescription)"
                print("[Strava] Connection check failed: \(error)")
            }
            isLoading = false
        }
    }
    
    /// Initiate Strava OAuth flow
    @MainActor
    func initiateStravaAuth() async {
        do {
            isLoading = true
            let response = try await apiService.post(
                "/api/strava/auth/authorize",
                body: [:],
                responseType: [String: String].self
            )
            
            if let authUrl = response["authUrl"], let url = URL(string: authUrl) {
                // Open in browser
                await MainActor.run {
                    if #available(iOS 14.0, *) {
                        UIApplication.shared.open(url, options: [:])
                    }
                }
            } else {
                self.errorMessage = "Failed to get Strava auth URL"
            }
        } catch {
            self.errorMessage = "Failed to initiate Strava auth: \(error.localizedDescription)"
            print("[Strava] Auth initiation failed: \(error)")
        }
        isLoading = false
    }
    
    /// Disconnect Strava account
    @MainActor
    func disconnectStrava() {
        Task {
            do {
                isLoading = true
                try await apiService.post(
                    "/api/strava/disconnect",
                    body: [:],
                    responseType: [String: Bool].self
                )
                
                self.connectionStatus = StravaConnection(
                    connected: false,
                    athleteName: nil,
                    athleteId: nil,
                    lastSync: nil,
                    tokenExpired: false
                )
                self.stravaActivities = []
                self.errorMessage = nil
            } catch {
                self.errorMessage = "Failed to disconnect Strava: \(error.localizedDescription)"
                print("[Strava] Disconnect failed: \(error)")
            }
            isLoading = false
        }
    }
    
    /// Publish a run to Strava
    @MainActor
    func publishToStrava(runId: String) {
        Task {
            do {
                isLoading = true
                publishResult = nil
                
                let result = try await apiService.post(
                    "/api/runs/\(runId)/publish-strava",
                    body: [:],
                    responseType: StravaPublishResult.self
                )
                
                self.publishResult = result
                self.errorMessage = nil
                
                // Refresh activities after delay
                try await Task.sleep(nanoseconds: 3_000_000_000)
                await fetchStravaActivities()
            } catch {
                let errorMsg = "Failed to publish run: \(error.localizedDescription)"
                self.publishResult = StravaPublishResult(
                    success: false,
                    uploadId: nil,
                    activityId: nil,
                    stravaUrl: nil,
                    message: nil,
                    error: errorMsg
                )
                self.errorMessage = errorMsg
                print("[Strava] Publish failed: \(error)")
            }
            isLoading = false
        }
    }
    
    /// Fetch list of published Strava activities
    @MainActor
    func fetchStravaActivities() {
        Task {
            do {
                isLoading = true
                let response = try await apiService.get(
                    "/api/strava/activities",
                    responseType: StravaActivitiesResponse.self
                )
                
                self.stravaActivities = response.activities
                self.errorMessage = nil
            } catch {
                self.errorMessage = "Failed to fetch activities: \(error.localizedDescription)"
                print("[Strava] Fetch activities failed: \(error)")
            }
            isLoading = false
        }
    }
    
    /// Clear error message
    func clearError() {
        errorMessage = nil
    }
    
    /// Clear publish result
    func clearPublishResult() {
        publishResult = nil
    }
}

// MARK: - API Service Protocol

protocol APIService {
    func get<T: Decodable>(_ endpoint: String, responseType: T.Type) async throws -> T
    func post<T: Decodable>(_ endpoint: String, body: [String: Any], responseType: T.Type) async throws -> T
}

// MARK: - Default API Service Implementation

class DefaultAPIService: APIService {
    private let baseURL: String
    private let authToken: String?
    
    init(baseURL: String = "https://api.airuncoach.com", authToken: String? = nil) {
        self.baseURL = baseURL
        self.authToken = authToken
    }
    
    func get<T: Decodable>(_ endpoint: String, responseType: T.Type) async throws -> T {
        let url = URL(string: baseURL + endpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NSError(domain: "APIService", code: -1, userInfo: ["message": "Invalid response"])
        }
        
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
    
    func post<T: Decodable>(_ endpoint: String, body: [String: Any], responseType: T.Type) async throws -> T {
        let url = URL(string: baseURL + endpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NSError(domain: "APIService", code: -1, userInfo: ["message": "Invalid response"])
        }
        
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
}
