class Food {
    constructor(x, y, config, Matter, engine) {
        this.config = config;
        this.isPoisoned = config.isPoisoned;
        this.energyValue = config.energyValue !== undefined ? config.energyValue : 15;
        this.radius = config.radius || 8;

        const texture = config.texture;
        const scaleX = config.xScale || 0.35;
        const scaleY = config.yScale || 0.35;

        this.body = Matter.Bodies.circle(x, y, this.radius, {
            label: this.isPoisoned ? 'poison' : 'food',
            isStatic: true,
            isSensor: true,
            render: {
                sprite: {
                    texture: texture,
                    xScale: scaleX,
                    yScale: scaleY
                }
            }
        });

        // Store radius on body for fast analytical raycasting
        this.body.rayRadius = this.radius;

        Matter.World.add(engine.world, this.body);
    }
}

class PoisonedFood extends Food {
    constructor(x, y, config, Matter, engine) {
        super(x, y, config, Matter, engine);
    }
}
