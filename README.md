# Image Sharing App

A modern, secure image sharing application built with Next.js, Shadcn UI, and Redis. Features single-user authentication, drag-and-drop uploads, and automatic expiration.

## Features
- 🔒 **Single Admin User** - Secure login using environment variables
- 📤 **Multiple Upload Methods**:
  - Drag and drop files
  - Paste from clipboard
  - Traditional file selection
- ⏱️ **Flexible Expiration Options**:
  - 2 hours, 1 day, 3 days, 7 days
  - 1 month, 3 months, 6 months, 1 year
- 🔗 **Unique Share URLs** - Each image gets a unique, shareable URL
- 📋 **Automatic Clipboard Copy** - Share URLs are automatically copied
- 🗑️ **Image Management** - View all uploaded images and delete as needed
- 🎨 **Light and dark themes** - Clean interface built with Shadcn UI and Bricolage Grotesque
- 🚀 **Fast & Optimized** - Images are processed and optimized before storage

## Prerequisites

- Node.js 18+ 
- Redis server (local or remote)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd image-sharing-app
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment example file:
```bash
cp env.example .env.local
```

4. Update `.env.local` with your configuration:
```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Admin Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_here

# NextAuth Secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000

# App Configuration
NEXT_PUBLIC_MAX_FILE_SIZE=10485760  # 10 MiB (10.49 MB), in bytes
```

## Running the Application

### Development

```bash
npm run dev
```

Visit `http://localhost:3000`

### Production

```bash
npm run build
npm start
```

For a production Dokploy deployment using the Dockerfile, see [container hardening and read-only runtime settings](docs/PREVENT-RCE-HACKED-VPS.md#current-dockerfile-hardening-for-dokploy).

### Docker Compose Local
```bash
 # Rebuilds Images if you make changes to the containers
docker compose -f docker-compose.localdev.yml up --build

# Stops/Removes Containers
docker compose -f docker-compose.localdev.yml down 
```


## Usage

### Native iOS App

The native SwiftUI app includes a Photos share extension and uses the same server and admin account as the website. It supports iOS 17+, image uploads, resizing, sharing, QR codes, and library management. Open `ios/ImageSH.xcodeproj` to build with your Apple Developer signing team.

See [iPhone setup, signing, and tests](ios/README.md) for installation instructions.

### Admin Login

1. Navigate to `/login` or any protected route
2. Enter the username and password from your environment variables
3. You'll be redirected to the admin dashboard

### Uploading Images

1. **Drag & Drop**: Drag an image onto the upload area
2. **Paste**: Press Ctrl/Cmd+V anywhere on the admin page, or use the Paste button
3. **Choose file**: Click "Choose file" to browse

Pick how long the image lives in the "Lives for" menu, then:
- Optionally rename it, or open "Reduce size" to scale it down before upload
- Click "Upload"
- A share sheet opens with the link (already copied to your clipboard when the browser allows it) and a QR code

Images over the size limit can be scaled down with "Reduce size" until they fit.

Web and iOS display decimal file sizes (1 KB = 1,000 bytes, 1 MB = 1,000,000 bytes), rounded to two decimal places. Before upload, the size describes the file being sent. Server processing can make the saved file smaller or larger. Library/API sizes describe the saved file and match the downloaded bytes; Redis's base64 storage overhead is excluded. Hover over a web library size, or open iOS image details, to see the exact byte count.

### Managing Images

The admin page shows every live image as a thumbnail with a ring that drains as it nears expiry. The ring turns amber under a day and red under two hours. From each card you can:
- Copy the share link
- Open the image, show its QR code, rename it, change its lifetime, or delete it from the "More actions" menu
- Sort by newest, soonest to expire, or name

Use the moon/sun button in the header to switch between light and dark themes.

Choose **Change lifetime** on the website or iPhone to edit an existing upload’s **Lives for** setting. The duration is measured from the original upload date, and the editor previews the resulting expiration. Durations that would already have expired are unavailable. Saving updates both the image and metadata expiration while keeping the same share link. Months use fixed 30-, 90-, and 180-day durations.

### Sharing Images

Share the generated URLs with anyone. Images are publicly accessible via their unique URLs until they expire. The viewer shows the image name, how long it has left, and a Save button.

## Technical Details

### Stack

- **Frontend**: Next.js 14 with App Router, TypeScript
- **UI**: Shadcn UI, Tailwind CSS
- **Authentication**: NextAuth.js with credentials provider
- **Database**: Redis for image storage and metadata
- **Image Processing**: Sharp for optimization

### API Routes

- `POST /api/admin/upload` - Upload new image (protected)
- `GET /api/admin/images` - List all images (protected)
- `PATCH /api/admin/images/[id]` - Update name and/or lifetime (protected); accepts `{ "name": "New name", "expiration": "7d" }` with either field optional, and returns `{ "success": true, "imageData": ... }`
- `DELETE /api/admin/images/[id]` - Delete specific image (protected)
- `GET /i/[id]` - Public route to view images

### Tests

Run `npm test` for upload, formatting, lifetime calculation, and update validation checks. To also test atomic expiration, concurrent edits, legacy binary sizes, and actual deletion at expiry, run a disposable local Redis and opt in explicitly:

```sh
docker run --rm -d --name imagesh-lifetime-tests \
  -p 127.0.0.1:16384:6379 redis:7-alpine \
  redis-server --appendonly no --save '' --requirepass imagesh-integration-only

IMAGESH_TEST_REDIS_URL=redis://127.0.0.1:16384 \
IMAGESH_TEST_REDIS_PASSWORD=imagesh-integration-only npm test

docker stop imagesh-lifetime-tests
```

The integration tests accept only a local Redis address and remove only their own temporary keys. See [iPhone tests](ios/README.md#tests) for native API, UI, and real-backend checks. Deploy the server and website changes before distributing an iPhone build that edits lifetimes; existing apps keep their upload and rename behavior.

### Security

- Admin routes protected by NextAuth middleware
- Environment-based credentials
- Images stored with TTL in Redis
- Automatic cleanup on expiration


## Troubleshooting

### Redis Connection Issues

Ensure Redis is running:
```bash
# Local Redis
redis-cli ping

# Docker Redis
docker exec -it <container-id> redis-cli ping
```

### Image Upload Failures

Check:
- File size is under the limit (default 10,485,760 bytes / 10.49 MB)
- File type is supported (JPEG, PNG, GIF, WebP)
- Redis has enough memory

### Authentication Issues

- Verify environment variables are set correctly
- Check NextAuth secret is properly configured
- Ensure cookies are enabled in your browser
