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

    // Check if mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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
            text-decoration: none;
            text-align: center;
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
    `;

    // Create the bookmarklet object
    window.__pamsRecipeBookmarklet = {
        overlay: null,
        modal: null,
        recipe: null,

        init: function() {
            // Add styles
            const styleEl = document.createElement('style');
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);

            this.show();
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

            // Show recipe preview with save button
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
                    <a href="#" class="pams-btn pams-btn-primary pams-save-btn">Save Recipe</a>
                    <button class="pams-btn pams-btn-secondary">Cancel</button>
                </div>
            `;

            this.modal.querySelector('.pams-close').onclick = () => this.hide();
            this.modal.querySelector('.pams-save-btn').onclick = (e) => {
                e.preventDefault();
                this.saveRecipe();
            };
            this.modal.querySelector('.pams-btn-secondary').onclick = () => this.hide();
        },

        saveRecipe: function() {
            const self = this;
            const recipeData = this.recipe;

            // Open save page
            const saveWindow = window.open('https://pams-recipes.web.app/save.html', '_blank');

            // Send recipe data via postMessage once the window loads
            const sendData = function() {
                if (saveWindow && !saveWindow.closed) {
                    saveWindow.postMessage({
                        type: 'PAMS_RECIPE_DATA',
                        recipe: recipeData
                    }, 'https://pams-recipes.web.app');
                }
            };

            // Try sending multiple times to ensure it arrives
            setTimeout(sendData, 500);
            setTimeout(sendData, 1000);
            setTimeout(sendData, 2000);
            setTimeout(sendData, 3000);

            this.hide();
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
