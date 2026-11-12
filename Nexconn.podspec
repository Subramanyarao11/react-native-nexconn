require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "Nexconn"
  # CocoaPods cannot resolve a development pod with a prerelease version once it
  # depends on a pod from a spec repository, so only the base version is used.
  s.version      = package["version"].split("-").first
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/Subramanyarao11/react-native-nexconn.git", :tag => "v#{package["version"]}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"

  s.dependency "NexconnChat/Chat", "26.4.2"

  install_modules_dependencies(s)
end
