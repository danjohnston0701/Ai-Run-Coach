import SwiftUI

// MARK: - Strava Settings View

struct StravaSettingsView: View {
    @ObservedObject var viewModel: StravaViewModel
    @State private var showingActivities = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                List {
                    Section(header: Text("Strava Integration")) {
                        StravaConnectionCard(
                            connectionStatus: viewModel.connectionStatus,
                            isLoading: viewModel.isLoading,
                            onConnect: {
                                Task {
                                    await viewModel.initiateStravaAuth()
                                }
                            },
                            onDisconnect: {
                                viewModel.disconnectStrava()
                            },
                            onShowActivities: {
                                showingActivities = true
                            }
                        )
                    }
                    
                    Section(header: Text("How It Works")) {
                        VStack(alignment: .leading, spacing: 8) {
                            HowItWorksStep(number: 1, text: "Connect your Strava account")
                            HowItWorksStep(number: 2, text: "Complete a run")
                            HowItWorksStep(number: 3, text: "Tap 'Share to Strava' in post-run screen")
                            HowItWorksStep(number: 4, text: "Activity appears in your Strava feed with route map")
                        }
                        .padding(.vertical, 4)
                    }
                    
                    Section(header: Text("Features")) {
                        FeatureRow(emoji: "📍", title: "GPS Track Mapping", description: "Strava generates route maps")
                        FeatureRow(emoji: "❤️", title: "Heart Rate Data", description: "Complete biometric details")
                        FeatureRow(emoji: "🏃", title: "Cadence Metrics", description: "Running dynamics included")
                        FeatureRow(emoji: "⛰️", title: "Elevation Data", description: "Altitude profiles included")
                    }
                }
                
                // Error Message
                if let error = viewModel.errorMessage {
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(.red)
                            Text(error)
                                .font(.caption)
                        }
                        Button(action: viewModel.clearError) {
                            Text("Dismiss")
                                .font(.caption)
                        }
                    }
                    .padding(8)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(8)
                    .padding()
                }
            }
            .navigationTitle("Strava")
            .navigationDestination(isPresented: $showingActivities) {
                StravaActivitiesView(viewModel: viewModel)
            }
        }
    }
}

// MARK: - Connection Card

struct StravaConnectionCard: View {
    let connectionStatus: StravaConnection
    let isLoading: Bool
    let onConnect: () -> Void
    let onDisconnect: () -> Void
    let onShowActivities: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: connectionStatus.connected ? "checkmark.circle.fill" : "info.circle.fill")
                    .foregroundColor(connectionStatus.connected ? .green : .blue)
                    .font(.system(size: 18))
                
                Text(connectionStatus.connected ? "Connected to Strava" : "Not Connected")
                    .font(.headline)
            }
            
            if connectionStatus.connected, let athleteName = connectionStatus.athleteName {
                VStack(alignment: .leading, spacing: 4) {
                    Text(athleteName)
                        .font(.subheadline)
                    if let lastSync = connectionStatus.lastSync {
                        Text("Last synced: \(lastSync)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            HStack(spacing: 8) {
                if connectionStatus.connected {
                    Button(action: onShowActivities) {
                        Label("Activities", systemImage: "list.bullet")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    
                    Button(role: .destructive, action: onDisconnect) {
                        Text("Disconnect")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button(action: onConnect) {
                        Label("Connect Strava", systemImage: "link")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            
            if isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

// MARK: - Helper Views

struct HowItWorksStep: View {
    let number: Int
    let text: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.caption)
                .fontWeight(.semibold)
                .frame(width: 20, height: 20)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
            
            Text(text)
                .font(.subheadline)
                .lineLimit(2)
            
            Spacer()
        }
    }
}

struct FeatureRow: View {
    let emoji: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(spacing: 12) {
            Text(emoji)
                .font(.system(size: 20))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
    }
}

// MARK: - Post-Run Share View

struct StravaShareView: View {
    let runId: String
    let connectionStatus: StravaConnection
    @ObservedObject var viewModel: StravaViewModel
    
    var body: some View {
        VStack(spacing: 12) {
            if connectionStatus.connected {
                StravaPublishButton(
                    isLoading: viewModel.isLoading,
                    onPublish: {
                        viewModel.publishToStrava(runId: runId)
                    }
                )
            } else {
                NotConnectedPrompt()
            }
            
            if let result = viewModel.publishResult {
                PublishResultCard(result: result)
            }
        }
    }
}

struct StravaPublishButton: View {
    let isLoading: Bool
    let onPublish: () -> Void
    
    var body: some View {
        Button(action: onPublish) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                }
                
                Image(systemName: "square.and.arrow.up")
                Text(isLoading ? "Publishing to Strava..." : "Share to Strava")
            }
            .frame(maxWidth: .infinity)
            .padding(12)
            .foregroundColor(.white)
            .background(Color(red: 0.99, green: 0.32, blue: 0)) // Strava orange
            .cornerRadius(8)
        }
        .disabled(isLoading)
    }
}

struct NotConnectedPrompt: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 24))
                .foregroundColor(.blue)
            
            Text("Connect Strava in Settings")
                .font(.headline)
            
            Text("Share your runs to Strava with complete GPS data and metrics")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

struct PublishResultCard: View {
    let result: StravaPublishResult
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: result.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundColor(result.success ? .green : .red)
                
                Text(
                    result.message ??
                    result.error ??
                    (result.success ? "Run published to Strava!" : "Failed to publish run")
                )
                .font(.subheadline)
                .lineLimit(2)
            }
            
            if let stravaUrl = result.stravaUrl, result.success {
                Link(destination: URL(string: stravaUrl)!) {
                    HStack {
                        Image(systemName: "safari")
                        Text("View on Strava")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .foregroundColor(.white)
                    .background(Color(red: 0.99, green: 0.32, blue: 0))
                    .cornerRadius(6)
                }
            }
            
            if result.uploadId != nil && result.activityId == nil && result.success {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Processing on Strava...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(8)
                .background(Color(.systemGray6))
                .cornerRadius(6)
            }
        }
        .padding()
        .background(
            result.success ?
            Color(.systemGreen).opacity(0.1) :
            Color(.systemRed).opacity(0.1)
        )
        .cornerRadius(8)
    }
}

// MARK: - Activities List View

struct StravaActivitiesView: View {
    @ObservedObject var viewModel: StravaViewModel
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            VStack {
                if viewModel.isLoading && viewModel.stravaActivities.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Loading activities...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                } else if viewModel.stravaActivities.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 40))
                            .foregroundColor(.secondary)
                        
                        Text("No activities published yet")
                            .font(.headline)
                        
                        Text("Your published runs will appear here")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                } else {
                    List {
                        ForEach(viewModel.stravaActivities) { activity in
                            ActivityRow(activity: activity)
                        }
                    }
                }
            }
            
            if let error = viewModel.errorMessage {
                VStack {
                    Spacer()
                    
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(.red)
                            Text(error)
                                .font(.caption)
                        }
                        Button(action: viewModel.clearError) {
                            Text("Dismiss")
                                .font(.caption)
                        }
                    }
                    .padding(8)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(8)
                    .padding()
                }
            }
        }
        .navigationTitle("Published to Strava")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task {
                await viewModel.fetchStravaActivities()
            }
        }
    }
}

struct ActivityRow: View {
    let activity: StravaActivity
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(activity.name)
                    .font(.headline)
                
                Spacer()
                
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(Color(red: 0.99, green: 0.32, blue: 0))
            }
            
            HStack(spacing: 16) {
                Label(
                    String(format: "%.1f km", activity.distance),
                    systemImage: "location.fill"
                )
                .font(.caption)
                .foregroundColor(.secondary)
                
                Label(
                    "\(activity.duration / 60)m",
                    systemImage: "clock.fill"
                )
                .font(.caption)
                .foregroundColor(.secondary)
            }
            
            Link(destination: URL(string: activity.stravaUrl)!) {
                HStack {
                    Image(systemName: "safari")
                    Text("View on Strava")
                }
                .frame(maxWidth: .infinity)
                .padding(8)
                .foregroundColor(.white)
                .background(Color(red: 0.99, green: 0.32, blue: 0))
                .cornerRadius(6)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Preview

#Preview {
    let viewModel = StravaViewModel(apiService: DefaultAPIService())
    return StravaSettingsView(viewModel: viewModel)
}
