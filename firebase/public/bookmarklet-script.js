/**
 * Pam's Recipe Collection - Bookmarklet Script
 * This script extracts recipe data from the current page and saves it to Firebase
 */

(function() {
    // Prevent multiple loads
    if (window.__pamsRecipeBookmarklet) {
        window.__pamsRecipeBookmarklet.show();
        return;
    }

    // Firebase config
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDuKQTnkseSJnShWm4bCq221Jb6ninil54",
        authDomain: "pams-recipes.firebaseapp.com",
        projectId: "pams-recipes",
    };

    const AUTHORIZED_EMAILS = ['glarsen8172@gmail.com', 'pkglines@gmail.com'];

    // Styles for the popup
    const styles = `
        .pams-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .pams-modal {
            background: white;
            border-radius: 16px;
            max-width: 400px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .pams-header {
            padding: 1.25rem;
            border-bottom: 1px solid #eee;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .pams-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: #2d2a26;
            margin: 0;
        }
        .pams-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #999;
            padding: 0;
            line-height: 1;
        }
        .pams-close:hover { color: #333; }
        .pams-body {
            padding: 1.25rem;
        }
        .pams-recipe-preview {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .pams-recipe-image {
            width: 80px;
            height: 80px;
            border-radius: 8px;
            object-fit: cover;
            background: #f0f0f0;
        }
        .pams-recipe-info h3 {
            font-size: 1rem;
            margin: 0 0 0.25rem 0;
            color: #2d2a26;
        }
        .pams-recipe-info p {
            font-size: 0.85rem;
            color: #666;
            margin: 0;
        }
        .pams-status {
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }
        .pams-status.loading {
            background: #e3f2fd;
            color: #1565c0;
        }
        .pams-status.success {
            background: #e8f5e9;
            color: #2e7d32;
        }
        .pams-status.error {
            background: #ffebee;
            color: #c62828;
        }
        .pams-btn {
            display: block;
            width: 100%;
            padding: 0.875rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .pams-btn-primary {
            background: #c85a38;
            color: white;
        }
        .pams-btn-primary:hover { background: #b84a2a; }
        .pams-btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .pams-btn-secondary {
            background: #f5f5f5;
            color: #333;
            margin-top: 0.5rem;
        }
        .pams-btn-secondary:hover { background: #eee; }
        .pams-signin {
            text-align: center;
        }
        .pams-signin p {
            margin-bottom: 1rem;
            color: #666;
        }
        .pams-google-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 0.95rem;
            cursor: pointer;
        }
        .pams-google-btn:hover {
            background: #f8f8f8;
            border-color: #ccc;
        }
    `;

    // Create the bookmarklet object
    window.__pamsRecipeBookmarklet = {
        overlay: null,
        modal: null,
        recipe: null,
        user: null,
        auth: null,

        init: function() {
            // Add styles
            const styleEl = document.createElement('style');
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);

            // Load Firebase
            this.loadFirebase();
        },

        loadFirebase: function() {
            const self = this;

            // Check if Firebase is already loaded
            if (window.firebase && window.firebase.auth) {
                self.setupAuth();
                return;
            }

            // Load Firebase scripts
            const scripts = [
                'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
                'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js'
            ];

            let loaded = 0;
            scripts.forEach(src => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = function() {
                    loaded++;
                    if (loaded === scripts.length) {
                        self.setupAuth();
                    }
                };
                document.head.appendChild(script);
            });
        },

        setupAuth: function() {
            const self = this;

            // Initialize Firebase if not already done
            if (!firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }

            this.auth = firebase.auth();
            this.db = firebase.firestore();

            // Check auth state
            this.auth.onAuthStateChanged(function(user) {
                self.user = user;
                self.show();
            });
        },

        show: function() {
            // Extract recipe first
            this.recipe = this.extractRecipe();

            // Create overlay
            this.overlay = document.createElement('div');
            this.overlay.className = 'pams-overlay';
            this.overlay.onclick = (e) => {
                if (e.target === this.overlay) this.hide();
            };

            // Create modal
            this.modal = document.createElement('div');
            this.modal.className = 'pams-modal';

            this.render();

            this.overlay.appendChild(this.modal);
            document.body.appendChild(this.overlay);
        },

        hide: function() {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
                this.modal = null;
            }
        },

        render: function() {
            const self = this;

            if (!this.user) {
                // Show sign in
                this.modal.innerHTML = `
                    <div class="pams-header">
                        <h2 class="pams-title">Save to Pam's Recipes</h2>
                        <button class="pams-close">&times;</button>
                    </div>
                    <div class="pams-body pams-signin">
                        <p>Sign in to save recipes to your collection</p>
                        <button class="pams-google-btn">
                            <svg width="18" height="18" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Sign in with Google
                        </button>
                    </div>
                `;

                this.modal.querySelector('.pams-close').onclick = () => this.hide();
                this.modal.querySelector('.pams-google-btn').onclick = () => this.signIn();
                return;
            }

            // Check if authorized
            if (!AUTHORIZED_EMAILS.includes(this.user.email)) {
                this.modal.innerHTML = `
                    <div class="pams-header">
                        <h2 class="pams-title">Save to Pam's Recipes</h2>
                        <button class="pams-close">&times;</button>
                    </div>
                    <div class="pams-body">
                        <div class="pams-status error">
                            Sorry, ${this.user.email} is not authorized to save recipes.
                        </div>
                        <button class="pams-btn pams-btn-secondary">Close</button>
                    </div>
                `;

                this.modal.querySelector('.pams-close').onclick = () => this.hide();
                this.modal.querySelector('.pams-btn-secondary').onclick = () => this.hide();
                return;
            }

            // Check if recipe found
            if (!this.recipe) {
                this.modal.innerHTML = `
                    <div class="pams-header">
                        <h2 class="pams-title">Save to Pam's Recipes</h2>
                        <button class="pams-close">&times;</button>
                    </div>
                    <div class="pams-body">
                        <div class="pams-status error">
                            Could not find a recipe on this page. Make sure you're on a recipe page and try again.
                        </div>
                        <button class="pams-btn pams-btn-secondary">Close</button>
                    </div>
                `;

                this.modal.querySelector('.pams-close').onclick = () => this.hide();
                this.modal.querySelector('.pams-btn-secondary').onclick = () => this.hide();
                return;
            }

            // Show recipe preview
            this.modal.innerHTML = `
                <div class="pams-header">
                    <h2 class="pams-title">Save to Pam's Recipes</h2>
                    <button class="pams-close">&times;</button>
                </div>
                <div class="pams-body">
                    <div class="pams-recipe-preview">
                        ${this.recipe.image_url ? `<img class="pams-recipe-image" src="${this.recipe.image_url}" alt="">` : ''}
                        <div class="pams-recipe-info">
                            <h3>${this.escapeHtml(this.recipe.title)}</h3>
                            <p>${this.recipe.author ? 'by ' + this.escapeHtml(this.recipe.author) : ''}</p>
                            <p>${this.recipe.ingredients ? this.recipe.ingredients.length + ' ingredients' : ''}</p>
                        </div>
                    </div>
                    <div class="pams-status-container"></div>
                    <button class="pams-btn pams-btn-primary pams-save-btn">Save Recipe</button>
                    <button class="pams-btn pams-btn-secondary">Cancel</button>
                </div>
            `;

            this.modal.querySelector('.pams-close').onclick = () => this.hide();
            this.modal.querySelector('.pams-save-btn').onclick = () => this.saveRecipe();
            this.modal.querySelector('.pams-btn-secondary').onclick = () => this.hide();
        },

        signIn: function() {
            const self = this;
            const provider = new firebase.auth.GoogleAuthProvider();

            this.auth.signInWithPopup(provider).catch(function(error) {
                console.error('Sign in error:', error);
                alert('Failed to sign in: ' + error.message);
            });
        },

        extractRecipe: function() {
            // Try JSON-LD first
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');

            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    const recipe = this.findRecipeInJsonLd(data);
                    if (recipe) {
                        return this.parseJsonLdRecipe(recipe);
                    }
                } catch (e) {
                    continue;
                }
            }

            return null;
        },

        findRecipeInJsonLd: function(data) {
            if (!data) return null;

            if (Array.isArray(data)) {
                for (const item of data) {
                    const result = this.findRecipeInJsonLd(item);
                    if (result) return result;
                }
                return null;
            }

            if (typeof data === 'object') {
                const type = data['@type'];
                if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
                    return data;
                }
                if (data['@graph']) {
                    return this.findRecipeInJsonLd(data['@graph']);
                }
            }

            return null;
        },

        parseJsonLdRecipe: function(data) {
            return {
                title: data.name || 'Untitled Recipe',
                url: window.location.href,
                description: data.description || null,
                prep_time: data.prepTime || null,
                cook_time: data.cookTime || null,
                total_time: data.totalTime || null,
                servings: this.parseYield(data.recipeYield),
                ingredients: this.parseIngredients(data.recipeIngredient),
                instructions: this.parseInstructions(data.recipeInstructions),
                image_url: this.parseImage(data.image),
                author: this.parseAuthor(data.author),
                nutrition: this.parseNutrition(data.nutrition),
            };
        },

        parseYield: function(y) {
            if (!y) return null;
            if (Array.isArray(y)) y = y[0];
            return String(y);
        },

        parseIngredients: function(ing) {
            if (!ing) return [];
            if (typeof ing === 'string') return [ing];
            return ing.map(i => String(i)).filter(i => i);
        },

        parseInstructions: function(inst) {
            if (!inst) return [];
            if (typeof inst === 'string') return inst.split('\n').filter(s => s.trim());

            const result = [];
            for (const item of inst) {
                if (typeof item === 'string') {
                    result.push(item);
                } else if (item['@type'] === 'HowToStep') {
                    if (item.text) result.push(item.text);
                } else if (item['@type'] === 'HowToSection') {
                    if (item.name) result.push('**' + item.name + '**');
                    if (item.itemListElement) {
                        for (const step of item.itemListElement) {
                            if (step.text) result.push(step.text);
                        }
                    }
                }
            }
            return result.filter(s => s);
        },

        parseImage: function(img) {
            if (!img) return null;
            if (typeof img === 'string') return img;
            if (img.url) return img.url;
            if (Array.isArray(img) && img.length) {
                const first = img[0];
                if (typeof first === 'string') return first;
                if (first.url) return first.url;
            }
            return null;
        },

        parseAuthor: function(author) {
            if (!author) return null;
            if (typeof author === 'string') return author;
            if (author.name) return author.name;
            if (Array.isArray(author) && author.length) {
                const first = author[0];
                if (typeof first === 'string') return first;
                if (first.name) return first.name;
            }
            return null;
        },

        parseNutrition: function(nutr) {
            if (!nutr || typeof nutr !== 'object') return null;

            const fields = [
                ['calories', 'Calories'],
                ['fatContent', 'Fat'],
                ['saturatedFatContent', 'Saturated Fat'],
                ['cholesterolContent', 'Cholesterol'],
                ['sodiumContent', 'Sodium'],
                ['carbohydrateContent', 'Carbohydrates'],
                ['fiberContent', 'Fiber'],
                ['sugarContent', 'Sugar'],
                ['proteinContent', 'Protein'],
            ];

            const result = {};
            for (const [field, label] of fields) {
                if (nutr[field]) result[label] = nutr[field];
            }

            return Object.keys(result).length ? result : null;
        },

        saveRecipe: async function() {
            const self = this;
            const statusContainer = this.modal.querySelector('.pams-status-container');
            const saveBtn = this.modal.querySelector('.pams-save-btn');

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            statusContainer.innerHTML = '<div class="pams-status loading">Saving recipe...</div>';

            try {
                // Check for duplicates
                const existing = await this.db.collection('recipes')
                    .where('url', '==', this.recipe.url)
                    .limit(1)
                    .get();

                if (!existing.empty) {
                    statusContainer.innerHTML = '<div class="pams-status error">This recipe has already been saved!</div>';
                    saveBtn.textContent = 'Already Saved';
                    return;
                }

                // Add metadata
                const recipeData = {
                    ...this.recipe,
                    date_added: new Date().toISOString(),
                    source: 'bookmarklet',
                    imported_by: this.user.uid,
                };

                // Remove null values
                Object.keys(recipeData).forEach(key => {
                    if (recipeData[key] === null) delete recipeData[key];
                });

                // Save to Firestore
                await this.db.collection('recipes').add(recipeData);

                statusContainer.innerHTML = '<div class="pams-status success">✓ Recipe saved successfully!</div>';
                saveBtn.textContent = 'Saved!';

                // Auto close after 2 seconds
                setTimeout(() => self.hide(), 2000);

            } catch (error) {
                console.error('Save error:', error);
                statusContainer.innerHTML = `<div class="pams-status error">Error: ${error.message}</div>`;
                saveBtn.disabled = false;
                saveBtn.textContent = 'Try Again';
            }
        },

        escapeHtml: function(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Initialize
    window.__pamsRecipeBookmarklet.init();
})();

