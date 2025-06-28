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
- 🎨 **Modern UI** - Beautiful interface built with Shadcn UI
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
NEXT_PUBLIC_MAX_FILE_SIZE=10485760  # 10MB in bytes
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

## Usage

### Admin Login

1. Navigate to `/login` or any protected route
2. Enter the username and password from your environment variables
3. You'll be redirected to the admin dashboard

### Uploading Images

1. **Drag & Drop**: Drag an image file onto the upload area
2. **Clipboard**: Copy an image and click "Paste from Clipboard" or use Ctrl/Cmd+V
3. **File Selection**: Click "Select File" to browse

After selecting an image:
- Choose expiration time
- Click "Upload"
- The share URL is automatically copied to your clipboard

### Managing Images

In the admin dashboard, you can:
- View all uploaded images
- See upload time and expiration status
- Copy share URLs
- Open images in new tabs
- Delete images

### Sharing Images

Share the generated URLs with anyone. Images are publicly accessible via their unique URLs until they expire.

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
- `DELETE /api/admin/images/[id]` - Delete specific image (protected)
- `GET /i/[id]` - Public route to view images

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
- File size is under the limit (default 10MB)
- File type is supported (JPEG, PNG, GIF, WebP)
- Redis has enough memory

### Authentication Issues

- Verify environment variables are set correctly
- Check NextAuth secret is properly configured
- Ensure cookies are enabled in your browser
