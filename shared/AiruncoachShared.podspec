Pod::Spec.new do |s|
  s.name             = 'AiruncoachShared'
  s.version          = '1.0.0'
  s.summary          = 'Shared AI Run Coach logic for iOS and Android'
  s.description      = 'Kotlin Multiplatform module containing data models, algorithms, and business logic for Ai Run Coach'
  s.homepage         = 'https://airuncoach.live'
  s.license          = { :type => 'MIT' }
  s.author           = { 'Ai Run Coach' => 'dev@airuncoach.live' }
  s.source           = { :git => 'https://github.com/danjohnston0701/Ai-Run-Coach.git', :tag => s.version.to_s }
  
  s.ios.deployment_target = '16.0'
  s.swift_version = '5.0'
  
  s.source_files = 'src/commonMain/**/*.{swift,kotlin,kt}'
  
  s.dependency 'kotlin-stdlib'
  s.dependency 'kotlinx-serialization-json'
  s.dependency 'kotlinx-coroutines-core'
  
  s.pod_target_xcconfig = {
    'APPLICATION_EXTENSION_API_ONLY' => 'NO',
    'KOTLIN_MODULE_NAME' => 'AiruncoachShared'
  }
end