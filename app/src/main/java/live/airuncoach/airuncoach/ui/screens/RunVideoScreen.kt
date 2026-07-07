@file:SuppressLint("SetJavaScriptEnabled")

package live.airuncoach.airuncoach.ui.screens

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.webkit.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import live.airuncoach.airuncoach.ui.theme.Colors
import java.io.File
import java.io.FileOutputStream

/**
 * WebView screen that loads the React /run-video/:runId page,
 * injects the Android auth token into localStorage before React reads it,
 * then intercepts the MediaRecorder blob download and surfaces a native share sheet.
 */
@Composable
fun RunVideoScreen(
    runId: String,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current

    // Read auth token from SessionManager (EncryptedSharedPreferences "session_prefs").
    // This is the SAME source the Retrofit interceptor uses, so the token here matches
    // the one sent on all native API calls. The old code read a plain, unencrypted
    // "user_prefs" file where the token was never stored, so it injected an empty token
    // into the WebView and every /api/runs/:id request returned 401 "No token provided".
    val authToken = remember {
        live.airuncoach.airuncoach.data.SessionManager(context).getAuthToken() ?: ""
    }

    val pendingVideoFile = remember { mutableStateOf<File?>(null) }
    val showShareSheet   = remember { mutableStateOf(false) }

    // Handler to hop state updates from the JS-bridge thread back onto the main thread
    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A0A0F))
    ) {
        // ── WebView ─────────────────────────────────────────────────────────────
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    settings.apply {
                        javaScriptEnabled                = true
                        domStorageEnabled                = true
                        mediaPlaybackRequiresUserGesture = false
                        mixedContentMode                 = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    }

                    // ── JS bridge: receives finished video as base64 ─────────────────
                    val bridge = object {
                        @JavascriptInterface
                        fun onVideoReady(base64Data: String, @Suppress("UNUSED_PARAMETER") mimeType: String, filename: String) {
                            Log.d("RunVideoScreen", "onVideoReady — ${base64Data.length} chars, $filename")
                            mainHandler.post {
                                try {
                                    val bytes   = Base64.decode(base64Data, Base64.DEFAULT)
                                    val outFile = File(ctx.cacheDir, filename)
                                    FileOutputStream(outFile).use { it.write(bytes) }
                                    pendingVideoFile.value = outFile
                                    showShareSheet.value   = true
                                } catch (e: Exception) {
                                    Log.e("RunVideoScreen", "Failed to save video blob", e)
                                }
                            }
                        }
                    }
                    addJavascriptInterface(bridge, "AndroidVideoPlayer")

                    webViewClient = object : WebViewClient() {

                        // Inject auth token as early as possible — before React reads localStorage.
                        // The web app reads the token from userProfile.token in localStorage.
                        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                            val safe = authToken
                                .replace("\\", "\\\\")
                                .replace("\"", "\\\"")
                            view.evaluateJavascript(
                                """(function(){try{var p=JSON.parse(localStorage.getItem('userProfile')||'{}');p.token="$safe";localStorage.setItem('userProfile',JSON.stringify(p));}catch(e){}})();""", null
                            )
                        }

                        // After page loads: re-assert token + inject blob download interceptor
                        override fun onPageFinished(view: WebView, url: String) {
                            val safe = authToken
                                .replace("\\", "\\\\")
                                .replace("\"", "\\\"")
                            view.evaluateJavascript("""
                                (function(){
                                  try{var p=JSON.parse(localStorage.getItem('userProfile')||'{}');p.token="$safe";localStorage.setItem('userProfile',JSON.stringify(p));}catch(e){};
                                  if(window.__arcVideoBridgeInjected)return;
                                  window.__arcVideoBridgeInjected=true;
                                  var orig=HTMLAnchorElement.prototype.click;
                                  HTMLAnchorElement.prototype.click=function(){
                                    if(this.download&&this.href&&this.href.startsWith('blob:')){
                                      var lnk=this;
                                      fetch(lnk.href)
                                        .then(function(r){return r.blob();})
                                        .then(function(blob){
                                          var rd=new FileReader();
                                          rd.onloadend=function(){
                                            var b64=rd.result.split(',')[1];
                                            AndroidVideoPlayer.onVideoReady(b64,blob.type,lnk.download);
                                          };
                                          rd.readAsDataURL(blob);
                                        })
                                        .catch(function(e){console.error('[RunVideoScreen]',e);});
                                      return;
                                    }
                                    orig.call(this);
                                  };
                                })();
                            """.trimIndent(), null)
                        }
                    }

                    loadUrl("https://airuncoach.live/run-video/$runId")
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // ── Native back button ────────────────────────────────────────────────
        Surface(
            onClick  = onNavigateBack,
            shape    = CircleShape,
            color    = Color.Black.copy(alpha = 0.6f),
            modifier = Modifier
                .statusBarsPadding()
                .padding(start = 12.dp, top = 8.dp)
                .size(40.dp)
                .align(Alignment.TopStart)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector        = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint               = Color.White,
                    modifier           = Modifier.size(20.dp)
                )
            }
        }
    }

    // ── Share / Save bottom sheet (shown when video is ready) ────────────────
    if (showShareSheet.value) {
        val file = pendingVideoFile.value
        if (file != null) {
            VideoReadyBottomSheet(
                filename          = file.name,
                onDismiss         = { showShareSheet.value = false },
                onShare           = {
                    showShareSheet.value = false
                    val uri = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file
                    )
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "video/webm"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(intent, "Share Run Video"))
                },
                onSaveToDownloads = {
                    showShareSheet.value = false
                    try {
                        val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(
                            android.os.Environment.DIRECTORY_DOWNLOADS
                        )
                        downloadsDir.mkdirs()
                        val dest = File(downloadsDir, file.name)
                        file.copyTo(dest, overwrite = true)
                        android.media.MediaScannerConnection.scanFile(
                            context, arrayOf(dest.absolutePath), arrayOf("video/webm"), null
                        )
                    } catch (e: Exception) {
                        Log.e("RunVideoScreen", "Save to Downloads failed", e)
                    }
                }
            )
        }
    }
}

// ── Video ready bottom sheet ─────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VideoReadyBottomSheet(
    filename: String,
    onDismiss: () -> Unit,
    onShare: () -> Unit,
    onSaveToDownloads: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color(0xFF0D1117),
        shape            = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        tonalElevation   = 8.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text       = "Video Ready!",
                fontSize   = 18.sp,
                fontWeight = FontWeight.Bold,
                color      = Color.White
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text     = filename,
                fontSize = 13.sp,
                color    = Color.White.copy(alpha = 0.5f)
            )
            Spacer(modifier = Modifier.height(24.dp))

            // Primary: share
            Button(
                onClick  = onShare,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape    = RoundedCornerShape(14.dp),
                colors   = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor   = Color.Black
                )
            ) {
                Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Share Video", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            Spacer(modifier = Modifier.height(10.dp))

            // Secondary: save to Downloads
            OutlinedButton(
                onClick  = onSaveToDownloads,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape    = RoundedCornerShape(14.dp),
                border   = BorderStroke(1.5.dp, Colors.primary.copy(alpha = 0.5f)),
                colors   = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
            ) {
                Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Save to Downloads", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}
