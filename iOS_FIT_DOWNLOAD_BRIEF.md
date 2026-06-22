# iOS: FIT File Download & Strava Upload Feature Brief

## Overview
Implement a feature to download run data as FIT (Flexible and Interoperable Data Transfer) files and upload them to Strava. This allows users to share their run data with Garmin and other platforms that support FIT format.

---

## Architecture

### Backend Endpoint
**Endpoint**: `GET /api/runs/:id/download-fit`
- **Authentication**: Required (uses existing auth token)
- **Method**: GET
- **Path Parameter**: `id` — the run ID to download
- **Response Type**: Binary file (application/octet-stream)
- **Response Headers**:
  - `Content-Type: application/octet-stream`
  - `Content-Disposition: attachment; filename="run_YYYYMMDD_HHMMSS.fit"`
  - `Content-Length: <file size in bytes>`

### File Naming Convention
- Format: `run_YYYYMMDD_HHMMSS.fit`
- Example: `run_20260622_155644.fit`
- Uses current timestamp to ensure unique filenames (prevents accidental overwrites)

### FIT File Contents
The backend generates a complete FIT file containing:
- **File Header**: Activity type (running), manufacturer info, serial number, creation timestamp
- **Device Info**: Device manufacturer, product ID, hardware/software version
- **Session Summary**: Total distance (meters), elapsed time (milliseconds), average/max speed, HR, cadence, elevation gain/loss
- **Lap Data**: Similar summary per lap
- **Trackpoints**: GPS coordinates (lat/lon), elevation, timestamps, heart rate, cadence for each GPS point

---

## iOS Implementation Guide

### 1. Network Layer

#### Add API Method (in your API Service)
```swift
// In your APIService/NetworkManager
func downloadRunAsFit(runId: String) -> URLRequest {
    var url = baseURL.appendingPathComponent("api/runs/\(runId)/download-fit")
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
    // Add auth token to headers
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    return request
}

// Alternative using Alamofire/URLSession
func downloadRunFit(runId: String, completion: @escaping (Result<Data, Error>) -> Void) {
    let url = baseURL.appendingPathComponent("api/runs/\(runId)/download-fit")
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
            completion(.failure(error))
            return
        }
        
        guard let data = data else {
            completion(.failure(NSError(domain: "No data", code: -1)))
            return
        }
        
        // Verify successful HTTP response
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode >= 400 {
            let error = NSError(domain: "HTTP Error", code: httpResponse.statusCode)
            completion(.failure(error))
            return
        }
        
        completion(.success(data))
    }.resume()
}
```

### 2. File Storage & Access

#### Save FIT File to Documents Directory
```swift
import Foundation

func saveFitFile(data: Data, fileName: String) -> URL? {
    let fileManager = FileManager.default
    guard let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
        return nil
    }
    
    let fileURL = documentsDirectory.appendingPathComponent(fileName)
    
    do {
        try data.write(to: fileURL, options: .atomic)
        print("FIT file saved: \(fileURL.path)")
        return fileURL
    } catch {
        print("Error saving FIT file: \(error.localizedDescription)")
        return nil
    }
}
```

#### Access Files Directory
Files can be accessed via:
- **iOS Files App**: On-device Files app will show documents directory
- **iTunes File Sharing**: If enabled in Info.plist (`UIFileSharingEnabled`)
- **iCloud Drive**: If using `NSUbiquitousContainerIdentifier`

### 3. Download UI Implementation

#### Button Action (in your Run Detail/Summary View)
```swift
@IBAction func downloadFitFileTapped() {
    showLoadingIndicator()
    
    // Call API to download
    apiService.downloadRunFit(runId: run.id) { [weak self] result in
        DispatchQueue.main.async {
            self?.hideLoadingIndicator()
            
            switch result {
            case .success(let data):
                // Generate unique filename with timestamp
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withFullDate, .withTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
                let timestamp = formatter.string(from: Date())
                    .replacingOccurrences(of: "-", with: "")
                    .replacingOccurrences(of: ":", with: "")
                    .replacingOccurrences(of: "T", with: "_")
                    .prefix(15)  // YYYYMMDD_HHMMSS
                
                let fileName = "run_\(timestamp).fit"
                
                if let fileURL = self?.saveFitFile(data: data, fileName: fileName) {
                    self?.showSuccessMessage("Run downloaded: \(fileName)")
                    // Optionally share or present file
                    self?.presentActivityViewController(for: fileURL)
                } else {
                    self?.showErrorMessage("Failed to save FIT file")
                }
                
            case .failure(let error):
                let errorMsg = error.localizedDescription
                self?.showErrorMessage("Download failed: \(errorMsg)")
            }
        }
    }
}
```

### 4. Share & Upload to Strava

#### Option A: Share via UIActivityViewController
```swift
func presentActivityViewController(for fileURL: URL) {
    let activityViewController = UIActivityViewController(
        activityItems: [fileURL],
        applicationActivities: nil
    )
    
    // Exclude certain activity types if desired
    activityViewController.excludedActivityTypes = [
        .saveToPDF,
        .print
    ]
    
    // Configure for iPad
    if let popoverController = activityViewController.popoverPresentationController {
        popoverController.sourceView = self.view
        popoverController.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 0, height: 0)
        popoverController.permittedArrowDirections = []
    }
    
    self.present(activityViewController, animated: true)
}
```

#### Option B: Direct Strava Upload (Advanced)
```swift
// If implementing direct Strava API integration:
// 1. User must authorize via Strava OAuth
// 2. Use Strava Upload API: POST /api/v3/uploads
// 3. Requires Strava API key and user token

func uploadToStrava(fitFileURL: URL, activityName: String, completion: @escaping (Bool, String?) -> Void) {
    guard let stravaToken = getStoredStravaToken() else {
        completion(false, "Not authenticated with Strava")
        return
    }
    
    let uploadURL = URL(string: "https://www.strava.com/api/v3/uploads")!
    var request = URLRequest(url: uploadURL)
    request.httpMethod = "POST"
    request.setValue("Bearer \(stravaToken)", forHTTPHeaderField: "Authorization")
    
    // Create multipart form data
    let boundary = UUID().uuidString
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    
    var body = Data()
    
    // Add file data
    let fitData = try! Data(contentsOf: fitFileURL)
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fitFileURL.lastPathComponent)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
    body.append(fitData)
    body.append("\r\n".data(using: .utf8)!)
    
    // Add activity name
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"name\"\r\n\r\n".data(using: .utf8)!)
    body.append(activityName.data(using: .utf8)!)
    body.append("\r\n".data(using: .utf8)!)
    
    // Add activity type
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"activity_type\"\r\n\r\n".data(using: .utf8)!)
    body.append("run".data(using: .utf8)!)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    
    request.httpBody = body
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
            completion(false, error.localizedDescription)
            return
        }
        
        if let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) {
            completion(true, nil)
        } else {
            completion(false, "Upload failed with status code")
        }
    }.resume()
}
```

### 5. Error Handling

#### Handle Common API Errors
```swift
enum FitDownloadError: LocalizedError {
    case invalidRunId
    case unauthorized
    case notFound
    case serverError(Int)
    case networkError(Error)
    case fileSaveError(Error)
    case emptyResponse
    
    var errorDescription: String? {
        switch self {
        case .invalidRunId:
            return "Invalid run ID"
        case .unauthorized:
            return "Not authorized to download this run"
        case .notFound:
            return "Run not found"
        case .serverError(let code):
            return "Server error: \(code)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .fileSaveError(let error):
            return "Failed to save file: \(error.localizedDescription)"
        case .emptyResponse:
            return "Server returned empty file"
        }
    }
}
```

### 6. UI Components

#### SwiftUI Implementation
```swift
struct RunDownloadButton: View {
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showSuccessAlert = false
    let runId: String
    let apiService: APIService
    
    var body: some View {
        VStack(spacing: 12) {
            Button(action: downloadFitFile) {
                HStack {
                    Image(systemName: "arrow.down.circle")
                    Text("Download Run as .FIT")
                        .fontWeight(.medium)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(8)
            }
            .disabled(isLoading)
            
            Button(action: shareToStrava) {
                HStack {
                    Image(systemName: "paperplane")
                    Text("Upload to Strava")
                        .fontWeight(.medium)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(red: 0.98, green: 0.33, blue: 0))  // Strava orange
                .foregroundColor(.white)
                .cornerRadius(8)
            }
            
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
            
            if isLoading {
                ProgressView()
            }
        }
        .alert("Success", isPresented: $showSuccessAlert) {
            Button("OK") { }
        } message: {
            Text("Run downloaded successfully!")
        }
    }
    
    private func downloadFitFile() {
        isLoading = true
        errorMessage = nil
        
        apiService.downloadRunFit(runId: runId) { result in
            DispatchQueue.main.async {
                isLoading = false
                
                switch result {
                case .success(let data):
                    let formatter = ISO8601DateFormatter()
                    formatter.formatOptions = [.withFullDate, .withTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
                    let timestamp = formatter.string(from: Date())
                        .replacingOccurrences(of: "-", with: "")
                        .replacingOccurrences(of: ":", with: "")
                        .prefix(15)
                    
                    let fileName = "run_\(timestamp).fit"
                    if let fileURL = saveFile(data: data, fileName: fileName) {
                        showSuccessAlert = true
                    }
                    
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    private func shareToStrava() {
        // Launch Strava app or open Strava website
        if let url = URL(string: "strava://") {
            UIApplication.shared.open(url) { success in
                if !success {
                    UIApplication.shared.open(URL(string: "https://www.strava.com/upload/select")!)
                }
            }
        }
    }
    
    private func saveFile(data: Data, fileName: String) -> URL? {
        let fileManager = FileManager.default
        guard let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        
        let fileURL = documentsDirectory.appendingPathComponent(fileName)
        
        do {
            try data.write(to: fileURL, options: .atomic)
            return fileURL
        } catch {
            errorMessage = "Failed to save file"
            return nil
        }
    }
}
```

---

## Integration Points

### 1. Run Summary/Detail Screen
- Add "Download Run as .FIT" button in the action buttons section
- Place next to or below existing "Upload to Strava" button (if present)
- Use consistent styling with other action buttons

### 2. File Management
- Files are stored in `Documents` directory
- Enable `UIFileSharingEnabled` in Info.plist to allow Files app access
- Consider auto-cleanup of old files after 7-30 days

### 3. Error States to Handle
- ✅ Network errors (timeout, no connectivity)
- ✅ 401 Unauthorized (user not authenticated)
- ✅ 403 Forbidden (user doesn't own this run)
- ✅ 404 Not Found (run was deleted)
- ✅ 500 Server error (server-side generation failed)
- ✅ Empty response (server returned 0-byte file)
- ✅ File save errors (disk full, permissions)

### 4. User Feedback
- Show loading spinner while downloading
- Display success toast with filename
- Show detailed error messages
- Provide "Retry" option on failure

---

## Testing Checklist

- [ ] Download successfully completes for a valid run
- [ ] File saves with correct timestamp-based filename
- [ ] File appears in Files app (if enabled)
- [ ] Correct HTTP status and error messages for different failure scenarios
- [ ] Network timeout is handled gracefully
- [ ] UI remains responsive during download
- [ ] File can be shared via UIActivityViewController
- [ ] File size matches expected range (typically 10-500 KB depending on run length)
- [ ] Works on different iOS versions (iOS 13+)
- [ ] Works on iPad (handle popover for UIActivityViewController)

---

## Notes

- **File Size**: FIT files are binary format, typically 10-500 KB depending on run length and frequency of GPS/sensor data
- **Timestamp Format**: Uses ISO8601 with format YYYYMMDD_HHMMSS (e.g., `20260622_155644`) for uniqueness and sorting
- **Strava Integration**: Two approaches:
  1. Simple: Use iOS Files app or share sheet (user manually uploads)
  2. Advanced: Direct Strava API integration (requires Strava OAuth)
- **Permissions**: Ensure proper entitlements for file access and network requests
- **Privacy**: FIT files contain GPS coordinates and may be considered sensitive — implement proper access controls

---

## Reference Links

- FIT File Format: https://developer.garmin.com/fit/overview/
- Strava API: https://developers.strava.com/docs/reference/
- iOS File Sharing: https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/

