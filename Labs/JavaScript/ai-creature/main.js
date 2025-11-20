document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('canvas1');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const simulation = new Simulation(canvas);
    simulation.init();
});