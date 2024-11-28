class Food {
	constructor(x, y, isPoisoned = false) 
	{
		this.isPoisoned = isPoisoned;
		const color = isPoisoned ? 'red' : 'green';
		const size = isPoisoned ? 5 : 5;
		
		this.body = Bodies.rectangle(x, y, size, size * 2, {
			render: { fillStyle: color },
			isStatic: false
		});

		World.add(engine.world, [this.body]);
	}
}

class PoisonedFood extends Food {
	constructor(x, y) {
		super(x, y, true);
	}
}