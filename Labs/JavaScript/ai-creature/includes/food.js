class Food {
	constructor(x, y, isPoisoned = false, Matter, engine) 
	{
		this.isPoisoned = isPoisoned;
		const color = isPoisoned ? 'red' : 'green';
		const size = isPoisoned ? 5 : 5;
		
		this.body = Matter.Bodies.rectangle(x, y, size, size * 2, {
			label: isPoisoned ? 'poison' : 'food',
			render: { fillStyle: color },
			isStatic: false
		});

		Matter.World.add(engine.world, this.body);
	}
}

class PoisonedFood extends Food {
	constructor(x, y, isPoisoned, Matter, engine) {
		super(x, y, isPoisoned, Matter, engine);
	}
}