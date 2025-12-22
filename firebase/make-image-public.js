/**
 * Make a Firebase Storage Image Public
 *
 * Usage: node make-image-public.js "images/filename.webp"
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

const filePath = process.argv[2];

if (!filePath) {
    console.log('\n📖 Usage: node make-image-public.js "images/filename.webp"\n');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'pams-recipes.firebasestorage.app'
});

const bucket = admin.storage().bucket();

async function makePublic() {
    try {
        const file = bucket.file(filePath);

        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            console.log(`\n❌ File not found: ${filePath}\n`);
            process.exit(1);
        }

        await file.makePublic();
        console.log(`\n✅ Image is now public!`);
        console.log(`URL: https://storage.googleapis.com/pams-recipes.firebasestorage.app/${filePath}\n`);
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        process.exit(1);
    }
}

makePublic();

