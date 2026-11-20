document.addEventListener("DOMContentLoaded", () => {
    const heroSection = document.getElementById('hero');

    // Function to generate a moving shrimp
    function spawnShrimp() {
        const shrimp = document.createElement('div');
        shrimp.classList.add('shrimp');
        shrimp.innerText = '🦐'; 

        // Randomize starting position along the bottom X-axis
        const startPosX = Math.random() * window.innerWidth;
        shrimp.style.left = `${startPosX}px`;

        // Randomize the animation duration so they move at different speeds
        const duration = Math.random() * 8 + 7; // Between 7s and 15s
        shrimp.style.animationDuration = `${duration}s`;

        // Randomize the size slightly for depth perception
        const scale = Math.random() * 0.6 + 0.7;
        shrimp.style.transform = `scale(${scale})`;

        heroSection.appendChild(shrimp);

        // Remove the shrimp from the DOM after its animation completes to save memory
        setTimeout(() => {
            if (heroSection.contains(shrimp)) {
                shrimp.remove();
            }
        }, duration * 1000);
    }

    // Spawn a new shrimp every 500 milliseconds (fast spawn rate)
    setInterval(spawnShrimp, 500);

    // Initial spawn to populate the screen immediately with 20 shrimps
    for(let i = 0; i < 20; i++) {
        setTimeout(spawnShrimp, Math.random() * 3000);
    }
});