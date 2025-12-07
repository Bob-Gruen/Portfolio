class FoodManager {
    constructor(canvas, Matter, engine, onSpawn, spawnInterval = 1000) {
        this.canvas = canvas;
        this.spawnInterval = spawnInterval;
        this.lastSpawnTime = 0;
        this.Matter = Matter;
        this.engine = engine;
        this.onSpawn = onSpawn;
    }

    spawnFoodCluster() {
        const new_food_items = [];
        const new_poisoned_food_items = [];
        let centerX = Math.random() * this.canvas.width;
        let centerY = Math.random() * this.canvas.height;
        let clusterSize = Math.floor(Math.random() * 25) + 50;   // 1 to 15 food items per cluster

        for (let j = 0; j < clusterSize; j++) {
            let x = centerX + (Math.random() - 0.5) * 100; // Spread within 100 pixels
            let y = centerY + (Math.random() - 0.5) * 100;

            if (Math.random() < 0.98) {
                new_food_items.push(new Food(x, y, false, this.Matter, this.engine));
            } else {
                new_poisoned_food_items.push(new PoisonedFood(x, y, true, this.Matter, this.engine));
            }
        }
        return { food: new_food_items, poison: new_poisoned_food_items };
    }

    update(currentTime) {
        if (currentTime - this.lastSpawnTime >= this.spawnInterval) {
            this.onSpawn(this.spawnFoodCluster());
            this.lastSpawnTime = currentTime;
        }
    }
}