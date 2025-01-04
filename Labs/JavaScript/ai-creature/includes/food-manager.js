class FoodManager 
{
    constructor(canvas, spawnInterval = 1000) 
    {
        this.canvas = canvas;
        this.spawnInterval = spawnInterval;
        this.lastSpawnTime = 0;
    }

    spawnFoodCluster() 
    {
        let centerX = Math.random() * this.canvas.width;
        let centerY = Math.random() * this.canvas.height;
        let clusterSize = Math.floor(Math.random() * 15) + 1;   // 1 to 15 food items per cluster

        for (let j = 0; j < clusterSize; j++) 
        {
            let x = centerX + (Math.random() - 0.5) * 100; // Spread within 100 pixels
            let y = centerY + (Math.random() - 0.5) * 100;

            if (Math.random() < 0.98) 
            { 
                // 95% chance for regular food
                let new_food = new Food(x, y);
                food_items.push(new_food);
            } 
            else 
            { 
                // 2% chance for poisoned food
                let new_poisoned_food = new PoisonedFood(x, y);
                food_items_poisoned.push(new_poisoned_food);
            }
        }
    }

    update(currentTime) 
    {
        if (currentTime - this.lastSpawnTime >= this.spawnInterval) 
        {
            this.spawnFoodCluster();
            this.lastSpawnTime = currentTime;
        }
    }
}