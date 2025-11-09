/**
 * Sensor system that casts rays to detect obstacles and road boundaries
 * Used as input for the neural network
 */
class Sensor{
    constructor(car){
        this.car=car;
        // Use config values if available, otherwise defaults
        this.rayCount = typeof CONFIG !== 'undefined' ? CONFIG.SENSOR_RAY_COUNT : 5;
        this.rayLength = typeof CONFIG !== 'undefined' ? CONFIG.SENSOR_RAY_LENGTH : 150;
        this.raySpread = typeof CONFIG !== 'undefined' ? CONFIG.SENSOR_RAY_SPREAD : Math.PI/2;

        this.rays=[];
        this.readings=[];
    }

    update(roadBorders,traffic){
        this.#castRays();
        this.readings=[];
        for(let i=0;i<this.rays.length;i++){
            this.readings.push(
                this.#getReading(
                    this.rays[i],
                    roadBorders,
                    traffic
                )
            );
        }
    }

    /**
     * Gets the closest intersection point for a sensor ray
     * Checks both road borders and traffic cars
     * @param {Array} ray - [start, end] points of the ray
     * @param {Array} roadBorders - Road boundary segments
     * @param {Array} traffic - Traffic car objects
     * @returns {Object|null} Intersection point with offset, or null if no intersection
     */
    #getReading(ray,roadBorders,traffic){
        let touches=[];

        // Check intersections with road borders
        for(let i=0;i<roadBorders.length;i++){
            const touch=getIntersection(
                ray[0],
                ray[1],
                roadBorders[i][0],
                roadBorders[i][1]
            );
            if(touch){
                touches.push(touch);
            }
        }

        // Check intersections with traffic cars
        for(let i=0;i<traffic.length;i++){
            const poly = traffic[i] && traffic[i].polygon;
            if(!poly || !poly.length) continue;
            for(let j=0;j<poly.length;j++){
                const value=getIntersection(
                    ray[0],
                    ray[1],
                    poly[j],
                    poly[(j+1)%poly.length]
                );
                if(value){
                    touches.push(value);
                }
            }
        }

        // Return closest intersection (smallest offset)
        if(touches.length==0){
            return null;
        }else{
            const offsets=touches.map(e=>e.offset);
            const minOffset=Math.min(...offsets);
            return touches.find(e=>e.offset==minOffset);
        }
    }

    /**
     * Casts sensor rays in an arc from the car
     * Rays are evenly distributed across the ray spread angle
     */
    #castRays(){
        this.rays=[];
        for(let i=0;i<this.rayCount;i++){
            // Calculate ray angle evenly distributed across spread
            const rayAngle=lerp(
                this.raySpread/2,
                -this.raySpread/2,
                this.rayCount==1?0.5:i/(this.rayCount-1)
            )+this.car.angle;

            const start={x:this.car.x, y:this.car.y};
            const end={
                x:this.car.x-
                    Math.sin(rayAngle)*this.rayLength,
                y:this.car.y-
                    Math.cos(rayAngle)*this.rayLength
            };
            this.rays.push([start,end]);
        }
    }

    draw(ctx){
        const color = this.car && this.car.color ? this.car.color : '#4a9eff';
        // Only render if there's at least one hit
        const hasHit = this.readings && this.readings.some(r => !!r);
        if (!hasHit) return;
        for(let i=0;i<this.rayCount;i++){
            const start = this.rays[i][0];
            const hit = this.readings[i];
            if (!hit) continue; // draw only rays that collided with something
            const end = hit;

            // main colored ray
            ctx.save();
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.9;
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.restore();

            // start circle
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.fillStyle = '#ffffff';
            ctx.arc(start.x, start.y, 3, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // end marker circle
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.fillStyle = '#ffffff';
            ctx.arc(end.x, end.y, 3, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }        
}