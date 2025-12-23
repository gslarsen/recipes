/**
 * Download Missing Images Script
 *
 * Finds recipes with image_url but no local_image_path, downloads the images,
 * uploads them to Firebase Storage, and updates the recipe.
 *
 * Usage: node download-missing-images.js [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be downloaded without actually doing it
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Parse command line args
const isDryRun = process.argv.includes('--dry-run');

// Paths
const IMAGES_DIR = path.join(__dirname, '..', 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'pams-recipes.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * Convert text to a URL-friendly slug
 */
function slugify(text) {
    if (!text) return 'unknown';
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 80) || 'unknown';
}

/**
 * Get a short hash from a string
 */
function shortHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Determine file extension from URL or content-type
 */
function getExtension(url, contentType) {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return '.jpg';
    if (urlLower.includes('.png')) return '.png';
    if (urlLower.includes('.gif')) return '.gif';
    if (urlLower.includes('.webp')) return '.webp';

    if (contentType) {
        if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
        if (contentType.includes('png')) return '.png';
        if (contentType.includes('gif')) return '.gif';
        if (contentType.includes('webp')) return '.webp';
    }

    return '.jpg';
}

/**
 * Download an image from a URL
 */
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            },
            timeout: 30000
        };

        const request = protocol.get(url, options, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadImage(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                resolve({
                    buffer: Buffer.concat(chunks),
                    contentType: response.headers['content-type']
                });
            });
            response.on('error', reject);
        });

        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

/**
 * Process a single recipe
 */
async function processRecipe(recipe, index, total) {
    const title = recipe.title || 'Unknown';
    const shortTitle = title.substring(0, 40);
    const url = recipe.image_url;

    console.log(`   [${index}/${total}] ${shortTitle}...`);

    if (isDryRun) {
        console.log(`            Would download: ${url.substring(0, 60)}...`);
        return { success: true, dryRun: true };
    }

    try {
        // Download the image
        const { buffer, contentType } = await downloadImage(url);

        // Generate filename
        const slug = slugify(title);
        const hash = shortHash(url);
        const ext = getExtension(url, contentType);
        const filename = `${slug}-${hash}${ext}`;
        const localPath = path.join(IMAGES_DIR, filename);

        // Save locally
        fs.writeFileSync(localPath, buffer);

        // Upload to Firebase Storage
        const storagePath = `images/${filename}`;
        await bucket.upload(localPath, {
            destination: storagePath,
            metadata: { contentType: contentType || 'image/jpeg' }
        });

        // Make public
        const file = bucket.file(storagePath);
        await file.makePublic();

        // Update Firestore
        await db.collection('recipes').doc(recipe.id).update({
            local_image_path: storagePath
        });

        console.log(`            ✅ Downloaded & uploaded: ${filename}`);
        return { success: true };

    } catch (error) {
        console.log(`            ❌ Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('\n🖼️  Download Missing Images');
    console.log('═'.repeat(60));

    if (isDryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    // Find recipes with image_url but no local_image_path
    console.log('\n📋 Finding recipes with missing local images...\n');

    const snapshot = await db.collection('recipes').get();
    const recipesToProcess = [];

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.image_url && !data.local_image_path) {
            recipesToProcess.push({ id: doc.id, ...data });
        }
    });

    if (recipesToProcess.length === 0) {
        console.log('✅ All recipes with images have local copies! Nothing to do.\n');
        process.exit(0);
    }

    console.log(`Found ${recipesToProcess.length} recipe(s) to process:\n`);
    console.log('─'.repeat(60));

    // Process each recipe
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < recipesToProcess.length; i++) {
        const recipe = recipesToProcess[i];
        const result = await processRecipe(recipe, i + 1, recipesToProcess.length);

        if (result.success) {
            successCount++;
        } else {
            failCount++;
        }

        // Small delay between requests to be nice to servers
        if (!isDryRun && i < recipesToProcess.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Summary
    console.log('\n' + '─'.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed:  ${failCount}`);

    if (isDryRun) {
        console.log('\n💡 Run without --dry-run to actually download images.\n');
    } else {
        console.log('\n🎉 Done! Refresh the website to see the new images.\n');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
});

