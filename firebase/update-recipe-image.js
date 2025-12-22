/**
 * Update Recipe Image Script
 *
 * Usage: node update-recipe-image.js "Recipe Title" "image-filename.jpg"
 *
 * Example: node update-recipe-image.js "Pork, Beef, and Black Bean Chili" "epicurious-pork-beef-black-bean-chili.jpg"
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');
const path = require('path');
const fs = require('fs');

// Get command line arguments
const recipeTitle = process.argv[2];
const imageFilename = process.argv[3];

if (!recipeTitle || !imageFilename) {
    console.log('\n📖 Usage: node update-recipe-image.js "Recipe Title" "image-filename.jpg"\n');
    console.log('Example:');
    console.log('  node update-recipe-image.js "Pork, Beef, and Black Bean Chili" "my-chili-image.jpg"\n');
    console.log('The image should be in the ../images/ folder.\n');
    process.exit(1);
}

const imagePath = path.join(__dirname, '..', 'images', imageFilename);

// Check if image exists
if (!fs.existsSync(imagePath)) {
    console.error(`\n❌ Image not found: ${imagePath}`);
    console.log(`\nMake sure the image is in the 'images/' folder.\n`);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'pams-recipes.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function updateRecipeImage() {
    console.log(`\n🔍 Searching for recipe: "${recipeTitle}"...`);

    // Find the recipe
    const snapshot = await db.collection('recipes').get();
    let foundRecipe = null;
    let foundDoc = null;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.title && data.title.toLowerCase() === recipeTitle.toLowerCase()) {
            foundRecipe = data;
            foundDoc = doc;
            break;
        }
    }

    // Try partial match if exact match not found
    if (!foundRecipe) {
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.title && data.title.toLowerCase().includes(recipeTitle.toLowerCase())) {
                foundRecipe = data;
                foundDoc = doc;
                console.log(`   (Partial match found)`);
                break;
            }
        }
    }

    if (!foundRecipe) {
        console.error(`\n❌ Recipe not found: "${recipeTitle}"`);
        console.log('\nAvailable recipes with similar names:');
        snapshot.docs.forEach(doc => {
            const title = doc.data().title || '';
            if (title.toLowerCase().includes(recipeTitle.toLowerCase().split(' ')[0])) {
                console.log(`  - ${title}`);
            }
        });
        process.exit(1);
    }

    console.log(`✅ Found: ${foundRecipe.title}`);

    // Determine content type
    const ext = path.extname(imageFilename).toLowerCase();
    const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    };
    const contentType = contentTypes[ext] || 'image/jpeg';

    // Upload to Firebase Storage
    const destinationPath = `recipe-images/${imageFilename}`;
    console.log(`\n📤 Uploading image to Firebase Storage...`);

    await bucket.upload(imagePath, {
        destination: destinationPath,
        metadata: { contentType }
    });

    // Make it public
    const file = bucket.file(destinationPath);
    await file.makePublic();

    console.log(`✅ Image uploaded!`);

    // Update recipe in Firestore
    console.log(`\n📝 Updating recipe...`);
    await db.collection('recipes').doc(foundDoc.id).update({
        local_image_path: destinationPath
    });

    console.log(`✅ Recipe updated!`);
    console.log(`\n🎉 Done! Refresh the website to see the new image.\n`);

    process.exit(0);
}

updateRecipeImage().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});

