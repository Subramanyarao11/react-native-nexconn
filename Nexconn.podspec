require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Official Nexconn iOS Chat SDK (CocoaPods trunk: NexconnChat). Apps can pin a
# different version with `$NexconnChatVersion = 'x.y.z'` in their Podfile, the
# NEXCONN_CHAT_VERSION environment variable, or (Expo) the config plugin's
# `sdkVersion` option, which writes `nexconn.chatVersion` to
# ios/Podfile.properties.json.
nexconn_chat_version = "26.4.2"
begin
  props = File.join(Pod::Config.instance.installation_root.to_s, "Podfile.properties.json")
  if File.exist?(props)
    pinned = JSON.parse(File.read(props))["nexconn.chatVersion"]
    nexconn_chat_version = pinned if pinned.is_a?(String) && !pinned.empty?
  end
rescue StandardError
  # Fall back to the default version.
end
nexconn_chat_version = ENV["NEXCONN_CHAT_VERSION"] if ENV["NEXCONN_CHAT_VERSION"]
nexconn_chat_version = $NexconnChatVersion if defined?($NexconnChatVersion) && $NexconnChatVersion

Pod::Spec.new do |s|
  s.name         = "Nexconn"
  # CocoaPods autolinking requires a version >= 0, which excludes 0.0.0-development.
  s.version      = package["version"].delete_suffix("-development")
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/Subramanyarao11/react-native-nexconn.git", :tag => "v#{package["version"]}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"
  s.swift_version = "5.9"

  s.dependency "NexconnChat/Chat", nexconn_chat_version

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "OTHER_LDFLAGS" => "$(inherited) -ObjC"
  }

  install_modules_dependencies(s)
end
