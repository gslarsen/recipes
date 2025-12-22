/**
 * Find Recipes with No Image At All
 * 
 * This script finds recipes that have neither local_image_path nor image_url.
 * Pam can decide if she wants to add her own images for these.
 * 
 * Usage: node find-no-image-recipes.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findNoImageRecipes() {
    console.log('\n🔍 Searching for recipes with no image at all...\n');
    
    const snapshot = await db.collection('recipes').get();
    
    const noImage = [];
    
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Has neither local nor external image
        if (!data.image_url && !data.local_image_path) {
            noImage.push({
                title: data.title,
                author: data.author || 'Unknown',
                url: data.url || null,
                date_added: data.date_added || null
            });
        }
    });
    
    if (noImage.length === 0) {
        console.log('✅ All recipes have images! Nothing to do.\n');
        process.exit(0);
    }
    
    console.log(`📋 Found ${noImage.length} recipe(s) with NO image:\n`);
    console.log('─'.repeat(80));
    
    noImage.forEach((r, i) => {
        console.log(`\n${i + 1}. ${r.title}`);
        console.log(`   Author: ${r.author}`);
        if (r.url) {
            console.log(`   Source: ${r.url}`);
        } else {
            console.log(`   Source: (Personal recipe - no URL)`);
        }
    });
    
    console.log('\n' + '─'.repeat(80));
    console.log(`\n💡 To add an image:`);
    console.log(`   1. Save a square image to the images/ folder`);
    console.log(`   2. Run: node update-recipe-image.js "Recipe Title" "image-name.jpg"\n`);
    
    process.exit(0);
}

findNoImageRecipes().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

