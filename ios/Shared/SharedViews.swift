import SwiftUI
import CoreImage.CIFilterBuiltins

struct BrandMark: View {
    var size: CGFloat = 36
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22).strokeBorder(lineWidth: size * 0.075)
            RoundedRectangle(cornerRadius: size * 0.06).frame(width: size * 0.44, height: size * 0.44)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct ErrorMessage: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.circle")
            .font(.subheadline).foregroundStyle(.red)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.updatesFrequently)
    }
}

struct RemoteImage: View {
    let url: URL
    var fit = false
    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                if fit { image.resizable().scaledToFit() }
                else { image.resizable().scaledToFill() }
            case .failure:
                VStack(spacing: 8) {
                    Image(systemName: "photo.badge.exclamationmark").font(.title2)
                    if fit { Text("Image unavailable or expired").font(.subheadline) }
                }.foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            default:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

struct LifetimeIndicator: View {
    let image: ImageRecord
    let now: Date
    private var remaining: TimeInterval { max(0, image.expiresAt.timeIntervalSince(now)) }
    private var color: Color {
        guard image.fractionRemaining(at: now) <= 0.5 else { return .secondary }
        if remaining <= 7200 { return .red }
        if remaining <= 86400 { return .orange }
        return .secondary
    }
    var body: some View {
        HStack(spacing: 5) {
            ZStack {
                Circle().stroke(color.opacity(0.2), lineWidth: 2)
                Circle().trim(from: 0, to: image.fractionRemaining(at: now))
                    .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round)).rotationEffect(.degrees(-90))
            }.frame(width: 12, height: 12).accessibilityHidden(true)
            if remaining <= 0 { Text("Expired") }
            else { Text(Self.timeLeft(remaining) + " left") }
        }
        .font(.caption).monospacedDigit().foregroundStyle(color)
    }

    private static func timeLeft(_ seconds: TimeInterval) -> String {
        let minutes = max(1, Int(seconds / 60)), hours = Int(seconds / 3600), days = Int(seconds / 86400)
        if days >= 7 { return "\(days)d" }
        if days > 0 { return hours % 24 > 0 ? "\(days)d \(hours % 24)h" : "\(days)d" }
        if hours >= 2 { return "\(hours)h" }
        if hours == 1 { return "1h \(minutes % 60)m" }
        return "\(minutes)m"
    }
}

struct QRCodeImage: View {
    let url: URL
    private var image: UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage,
              let cgImage = CIContext().createCGImage(output.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
                                                       from: output.extent.applying(CGAffineTransform(scaleX: 8, y: 8))) else { return nil }
        return UIImage(cgImage: cgImage)
    }
    var body: some View {
        if let image {
            Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                .padding(16).background(.white, in: RoundedRectangle(cornerRadius: 16))
                .accessibilityLabel("QR code for the share link")
        }
    }
}

struct ShareResultView: View {
    let image: ImageRecord
    let url: URL
    var allowSystemSharing = true
    var copyOnAppear = false
    var onDone: (() -> Void)?
    @State private var copied = false
    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 48)).foregroundStyle(.green)
                VStack(spacing: 6) {
                    Text("Ready to share").font(.title2.bold())
                    Text(image.displayName).foregroundStyle(.secondary).lineLimit(2)
                }
                QRCodeImage(url: url).frame(maxWidth: 220)
                Text(url.absoluteString).font(.subheadline.monospaced()).textSelection(.enabled)
                    .multilineTextAlignment(.center).padding(.horizontal)
                VStack(spacing: 12) {
                    Button {
                        UIPasteboard.general.url = url
                        copied = true
                    } label: {
                        Label(copied ? "Link copied" : "Copy link", systemImage: copied ? "checkmark" : "link")
                            .frame(maxWidth: .infinity)
                    }.buttonStyle(.borderedProminent).controlSize(.large)
                    if allowSystemSharing {
                        ShareLink(item: url) { Label("Share link", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity) }
                            .buttonStyle(.bordered).controlSize(.large)
                    }
                }
                Text("Expires \(image.expiresAt.formatted(date: .abbreviated, time: .shortened))")
                    .font(.footnote).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth: 500).frame(maxWidth: .infinity)
        }
        .navigationTitle("Share image").navigationBarTitleDisplayMode(.inline)
        .toolbar { if let onDone { ToolbarItem(placement: .confirmationAction) { Button("Done", action: onDone) } } }
        .onAppear { if copyOnAppear { UIPasteboard.general.url = url; copied = true } }
    }
}
