class Lake {
    constructor(canvas, Matter, engine) {
        this.canvas = canvas;
        this.Matter = Matter;
        this.engine = engine;
        this.shallowWater = [];
        this.deepWater = [];
    }

    create() {
        const centerX = Math.random() * (this.canvas.width - 400) + 200;
        const centerY = Math.random() * (this.canvas.height - 400) + 200;
        const baseRadius = Math.random() * 100 + 100; // Random base size
        const complexity = 50; // Fewer points are needed for a smooth shape

        console.log('cmplexity: ' + complexity)
        this._createWaterBody(centerX, centerY, baseRadius, complexity, 'shallow_water', this.shallowWater, 'rgba(100, 150, 255, 0.7)');
        this._createWaterBody(centerX, centerY, baseRadius * 0.6, complexity, 'deep_water', this.deepWater, 'rgba(0, 50, 200, 0.6)');
    }

    _createWaterBody(cx, cy, radius, complexity, label, bodyArray, color) {
        const points = [];
        const noisePoints = 12; // How many random points to define the noise shape
        const noiseStrength = 0.4; // How much the noise affects the radius
        const randomValues = [];
        for (let i = 0; i < noisePoints; i++) {
            randomValues.push(Math.random());
        }

        for (let i = 0; i < complexity; i++) {
            const angle = (i / complexity) * 2 * Math.PI;

            // --- Interpolated Noise Generation ---
            const noiseIndex = (angle / (2 * Math.PI)) * noisePoints;
            const index1 = Math.floor(noiseIndex) % noisePoints;
            const index2 = (index1 + 1) % noisePoints;
            const blend = noiseIndex - Math.floor(noiseIndex);
            const cosBlend = (1 - Math.cos(blend * Math.PI)) / 2; // Cosine interpolation for smoothness
            const noiseValue = randomValues[index1] * (1 - cosBlend) + randomValues[index2] * cosBlend;
            // --- End of Noise Generation ---

            const r = radius * (1 + (noiseValue - 0.5) * 2 * noiseStrength); // Center noise around 0
            points.push({
                x: cx + Math.cos(angle) * r,
                y: cy + Math.sin(angle) * r,
            });
        }

        let border_color = 'rgba(150, 75, 0, 0.7)';
        let border_width = 55;

        if(label === 'deep_water') {
            //points.reverse();
            border_color = 'rgba(0, 30, 180, 0.3)';
            border_width = 5;
        }

        const waterBody = this.Matter.Bodies.fromVertices(cx, cy, [points], {
            isStatic: true,
            isSensor: true,
            label: label,
            render: { fillStyle: color, strokeStyle: border_color, 'lineWidth': border_width }
        });

        this.Matter.World.add(this.engine.world, waterBody);
        bodyArray.push(waterBody);
    }
}
