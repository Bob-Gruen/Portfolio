class Controls {
    constructor(simulation) {
        this.sim = simulation;
        this.restartPending = false;

        // Static config for core settings
        this.staticConfig = [
            {
                id: 'gen-time',
                label: 'Generation Time',
                min: 10,
                max: 120,
                step: 5,
                unit: 's',
                get: () => this.sim.GENERATION_TIMER,
                set: (val) => {
                    this.sim.GENERATION_TIMER = parseInt(val);
                    if (this.sim.generationTimer > this.sim.GENERATION_TIMER) {
                        this.sim.generationTimer = this.sim.GENERATION_TIMER;
                    }
                },
                restart: false
            },
            {
                id: 'pop-size',
                label: 'Population Size',
                min: 10,
                max: 300,
                step: 10,
                get: () => this.sim.NUM_CREATURES,
                set: (val) => {
                    this.sim.NUM_CREATURES = parseInt(val);
                    this.setRestartPending(true);
                },
                restart: true
            },
            {
                id: 'food-spawn',
                label: 'Food Spawn Rate',
                min: 10,
                max: 2000,
                step: 10,
                unit: 'ms',
                get: () => this.sim.FOOD_SPAWN_INTERVAL,
                set: (val) => {
                    this.sim.FOOD_SPAWN_INTERVAL = parseInt(val);
                    if (this.sim.foodManager) {
                        this.sim.foodManager.spawnInterval = parseInt(val);
                    }
                },
                restart: false
            },
            {
                id: 'food-max',
                label: 'Max Food Items',
                min: 100,
                max: 2000,
                step: 50,
                get: () => this.sim.NUM_FOOD_ITEMS,
                set: (val) => {
                    this.sim.NUM_FOOD_ITEMS = parseInt(val);
                    this.setRestartPending(true);
                },
                restart: true
            }
        ];

        this.initUI();
    }

    initUI() {
        const container = document.getElementById('control-panel-content');
        if (!container) return;

        container.innerHTML = ''; // Clear existing

        // 1. Render Static Controls
        this.staticConfig.forEach(cfg => this.createControl(container, cfg));

        // 2. Render Layer Count Control
        this.createControl(container, {
            id: 'hidden-layers',
            label: 'Hidden Layers',
            min: 1,
            max: 5,
            step: 1,
            get: () => this.sim.NETWORK_CONFIG.hiddenLayers.length,
            set: (val) => {
                const count = parseInt(val);
                // Resize hiddenLayers array, preserving values where possible or defaulting to 16
                const currentLayers = this.sim.NETWORK_CONFIG.hiddenLayers;
                const newLayers = [];
                for (let i = 0; i < count; i++) {
                    newLayers.push(currentLayers[i] || 16);
                }
                this.sim.NETWORK_CONFIG.hiddenLayers = newLayers;

                this.setRestartPending(true);
                this.renderLayerControls(); // Re-render the dynamic part
            },
            restart: true
        });

        // 3. Container for Dynamic Layer Controls
        this.layerControlsContainer = document.createElement('div');
        this.layerControlsContainer.id = 'layer-controls-container';
        container.appendChild(this.layerControlsContainer);

        this.renderLayerControls();

        // 4. Restart Button Logic
        const restartBtn = document.getElementById('restart-btn');
        // Remove old listeners to avoid duplicates if re-init
        const newBtn = restartBtn.cloneNode(true);
        restartBtn.parentNode.replaceChild(newBtn, restartBtn);

        newBtn.addEventListener('click', () => {
            // If restart is pending, we might want a full reset (clearing population)
            // especially if network config changed.
            // For now, if "Restart (Required)" is active, we assume structural changes implies full reset.
            // But pop-size change also triggers it.
            // Safest: Always full reset on manual button click to match user expectation of "Reset".
            this.sim.resetWorld(true);
            this.setRestartPending(false);
        });

        const toggleBtn = document.getElementById('control-panel-toggle');
        const panel = document.getElementById('control-panel');
        if (toggleBtn && panel) {
            // Clone to remove old listeners
            const newToggle = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);

            newToggle.addEventListener('click', () => {
                panel.classList.toggle('hidden');
                // Don't change text content if it's the gear icon vs X, just toggle.
                // Or keep simple:
                // newToggle.innerText = panel.classList.contains('hidden') ? '⚙️' : '❌';
            });
        }
    }

    renderLayerControls() {
        if (!this.layerControlsContainer) return;
        this.layerControlsContainer.innerHTML = '';

        this.sim.NETWORK_CONFIG.hiddenLayers.forEach((size, index) => {
            this.createControl(this.layerControlsContainer, {
                id: `layer-${index}-size`,
                label: `Layer ${index + 1} Nodes`,
                min: 4,
                max: 128,
                step: 4,
                get: () => this.sim.NETWORK_CONFIG.hiddenLayers[index],
                set: (val) => {
                    this.sim.NETWORK_CONFIG.hiddenLayers[index] = parseInt(val);
                    this.setRestartPending(true);
                },
                restart: true
            });
        });
    }

    createControl(parent, cfg) {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelRow = document.createElement('div');
        labelRow.className = 'control-row';

        const label = document.createElement('label');
        label.className = 'control-label';
        label.innerText = cfg.label;
        label.htmlFor = cfg.id;

        const valDisplay = document.createElement('span');
        valDisplay.className = 'value-display';
        valDisplay.id = `val-${cfg.id}`;
        valDisplay.innerText = cfg.get() + (cfg.unit || '');

        labelRow.appendChild(label);
        labelRow.appendChild(valDisplay);
        group.appendChild(labelRow);

        if (cfg.restart) {
            const restartNote = document.createElement('div');
            restartNote.className = 'requires-restart';
            restartNote.innerText = '* Requires Reset';
            group.appendChild(restartNote);
        }

        const inputRow = document.createElement('div');
        inputRow.className = 'control-row';

        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';

        const input = document.createElement('input');
        input.type = 'range';
        input.id = cfg.id;
        input.min = cfg.min;
        input.max = cfg.max;
        input.step = cfg.step;
        input.value = cfg.get();

        input.addEventListener('input', (e) => {
            const val = e.target.value;
            valDisplay.innerText = val + (cfg.unit || '');
            cfg.set(val);
        });

        sliderContainer.appendChild(input);
        inputRow.appendChild(sliderContainer);
        group.appendChild(inputRow);

        parent.appendChild(group);
    }

    setRestartPending(isPending) {
        this.restartPending = isPending;
        const btn = document.getElementById('restart-btn');
        if (btn) {
            if (isPending) {
                btn.classList.add('pending');
                btn.innerText = 'Reset World (Required)';
            } else {
                btn.classList.remove('pending');
                btn.innerText = 'Reset World';
            }
        }
    }
}
