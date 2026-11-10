// Draws the existing ImageSH favicon motif at Apple's required app icon resolution.
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Foundation

let output = CommandLine.arguments.dropFirst().first ?? "App/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(srgbRed: 0.96, green: 0.95, blue: 0.93, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
context.setStrokeColor(CGColor(srgbRed: 0.09, green: 0.09, blue: 0.09, alpha: 1))
context.setLineWidth(64)
context.addPath(CGPath(roundedRect: CGRect(x: 192, y: 192, width: 640, height: 640), cornerWidth: 142, cornerHeight: 142, transform: nil))
context.strokePath()
context.setFillColor(CGColor(srgbRed: 0.09, green: 0.09, blue: 0.09, alpha: 1))
context.addPath(CGPath(roundedRect: CGRect(x: 370, y: 370, width: 284, height: 284), cornerWidth: 48, cornerHeight: 48, transform: nil))
context.fillPath()
let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Could not export the icon") }
