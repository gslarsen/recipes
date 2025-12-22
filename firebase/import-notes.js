/**
 * Script to import "My Private Notes" from recipes_with_notes.json into Firestore
 *
 * Run with: node import-notes.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');
const notesData = require('../output/recipes_with_notes.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importNotes() {
    console.log('📝 Importing My Private Notes...\n');

    // Get all recipes from Firestore
    const recipesSnapshot = await db.collection('recipes').get();
    const recipes = [];
    recipesSnapshot.forEach(doc => recipes.push({ id: doc.id, ...doc.data() }));

    console.log(`Found ${recipes.length} recipes in Firestore`);
    console.log(`Found ${notesData.length} recipes with notes to import\n`);

    let matched = 0;
    let notFound = [];

    for (const noteEntry of notesData) {
        // Try to match by URL first (most reliable)
        let recipe = recipes.find(r => r.url === noteEntry.url);

        // If no URL match, try by title (fuzzy match)
        if (!recipe) {
            const normalizedTitle = noteEntry.title.toLowerCase().trim();
            recipe = recipes.find(r => {
                const recipeTitle = (r.title || '').toLowerCase().trim();
                return recipeTitle === normalizedTitle ||
                       recipeTitle.includes(normalizedTitle) ||
                       normalizedTitle.includes(recipeTitle);
            });
        }

        if (recipe) {
            await db.collection('recipes').doc(recipe.id).update({
                notes: noteEntry.notes
            });
            console.log(`✅ Updated: ${noteEntry.title}`);
            matched++;
        } else {
            console.log(`❌ Not found: ${noteEntry.title}`);
            notFound.push(noteEntry.title);
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`\n✅ Successfully imported notes for ${matched} recipes`);

    if (notFound.length > 0) {
        console.log(`\n❌ ${notFound.length} recipes not found in database:`);
        notFound.forEach(title => console.log(`   - ${title}`));
    }

    process.exit(0);
}

importNotes().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

