/**
 * Find Recipes with External URL but No Local Image
 * 
 * This script finds recipes that have an image_url (external) but no local_image_path.
 * These are candidates for downloading the external image and saving locally.
 * 
 * Usage: node find-missing-local-images.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findMissingLocalImages() {
    console.log('\n🔍 Searching for recipes with external URL but no local image...\n');
    
    const snapshot = await db.collection('recipes').get();
    
    const needsLocalImage = [];
    
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Has external URL but no local image
        if (data.image_url && !data.local_image_path) {
            needsLocalImage.push({
                title: data.title,
                image_url: data.image_url,
                date_added: data.date_added || null
            });
        }
    });
    
    if (needsLocalImage.length === 0) {
        console.log('✅ All recipes with images have local copies! Nothing to do.\n');
        process.exit(0);
    }
    
    console.log(`📋 Found ${needsLocalImage.length} recipe(s) needing local images:\n`);
    console.log('─'.repeat(80));
    
    needsLocalImage.forEach((r, i) => {
        console.log(`\n${i + 1}. ${r.title}`);
        if (r.date_added) {
            const date = r.date_added.toDate ? r.date_added.toDate() : new Date(r.date_added);
            console.log(`   Added: ${date.toLocaleDateString()}`);
        }
        console.log(`   URL: ${r.image_url}`);
    });
    
    console.log('\n' + '─'.repeat(80));
    console.log(`\n💡 To fix: Save each image to the images/ folder, then run:`);
    console.log(`   node update-recipe-image.js "Recipe Title" "saved-image-name.jpg"\n`);
    
    process.exit(0);
}

findMissingLocalImages().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

