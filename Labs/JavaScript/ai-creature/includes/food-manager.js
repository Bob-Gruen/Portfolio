class FoodManager {
    constructor(canvas, Matter, engine, onSpawn, spawnInterval = 120) {
        this.canvas = canvas;
        this.spawnInterval = spawnInterval;
        this.lastSpawnTime = 0;
        this._spawnAccum = 0;
        this.Matter = Matter;
        this.engine = engine;
        this.onSpawn = onSpawn;

        // Simplified to 1 Food type and 1 Poison type (Storyland theme)
        this.FOOD_TYPE = {
            name: 'Sunberry',
            isPoisoned: false,
            energyValue: 20,
            radius: 8,
            texture: './assets/storyland_food.svg',
            xScale: 0.36,
            yScale: 0.36
        };

        this.POISON_TYPE = {
            name: 'Shadow Toadstool',
            isPoisoned: true,
            energyValue: -25,
            radius: 8,
            texture: './assets/storyland_poison.svg',
            xScale: 0.38,
            yScale: 0.38
        };
    }

    spawnFoodCluster(poisonChance = 0.08) {
        const new_food_items = [];
        const new_poisoned_food_items = [];
        const margin = 40;
        const centerX = margin + Math.random() * Math.max(100, this.canvas.width - margin * 2);
        const centerY = margin + Math.random() * Math.max(100, this.canvas.height - margin * 2);
        const clusterSize = Math.floor(Math.random() * 12) + 5; // 5 to 16 items per cluster

        for (let j = 0; j < clusterSize; j++) {
            const x = Math.min(this.canvas.width - 20, Math.max(20, centerX + (Math.random() - 0.5) * 110));
            const y = Math.min(this.canvas.height - 20, Math.max(20, centerY + (Math.random() - 0.5) * 110));

            if (Math.random() >= poisonChance) {
                new_food_items.push(new Food(x, y, this.FOOD_TYPE, this.Matter, this.engine));
            } else {
                new_poisoned_food_items.push(new PoisonedFood(x, y, this.POISON_TYPE, this.Matter, this.engine));
            }
        }
        return { food: new_food_items, poison: new_poisoned_food_items };
    }

    update(currentTime, currentFoodCount = 0, maxFoodCount = Infinity) {
        if (currentFoodCount >= maxFoodCount) {
            this.lastSpawnTime = currentTime;
            return;
        }
        if (currentTime - this.lastSpawnTime >= this.spawnInterval) {
            this.onSpawn(this.spawnFoodCluster());
            this.lastSpawnTime = currentTime;
        }
    }

    updateByDelta(dtMs, currentFoodCount = 0, maxFoodCount = Infinity) {
        if (currentFoodCount >= maxFoodCount) {
            this._spawnAccum = 0;
            return;
        }

        // Emergency replenishment if creatures scoop food faster than normal spawn rate
        const minFoodFloor = Math.floor(maxFoodCount * 0.4);
        if (currentFoodCount < minFoodFloor) {
            let added = 0;
            let clusters = 0;
            while (currentFoodCount + added < minFoodFloor && clusters < 4) {
                const batch = this.spawnFoodCluster();
                this.onSpawn(batch);
                added += batch.food.length;
                clusters++;
            }
            this._spawnAccum = 0;
            return;
        }

        this._spawnAccum += dtMs;
        if (this._spawnAccum >= this.spawnInterval) {
            this.onSpawn(this.spawnFoodCluster());
            this._spawnAccum -= this.spawnInterval;
        }
    }
}
