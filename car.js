/**
 * Car class representing a vehicle in the simulation
 * Can be controlled by AI (neural network), keyboard, or dummy logic
 */
class Car{
    constructor(x,y,width,height,controlType,angle=0,maxSpeed=null,color="blue"){
        this.color = color;
        if (typeof Car.nextId === 'undefined') {
            Car.nextId = 1;
        }
        this.id = Car.nextId++;
        this.x=x;
        this.y=y;
        this.width=width;
        this.height=height;

        this.speed=0;
        this.acceleration=typeof CONFIG !== 'undefined' ? CONFIG.ACCELERATION : 0.2;
        this.maxSpeed=maxSpeed || (typeof CONFIG !== 'undefined' ? CONFIG.MAX_SPEED : 3);
        this.friction=typeof CONFIG !== 'undefined' ? CONFIG.FRICTION : 0.05;
        this.angle=angle;
        this.damaged=false;
        this.recovering=false;
        this.recoverFrames=0;

        this.fitness = 0;

        this.useBrain=controlType=="AI";

        if(controlType!="DUMMY"){
            this.sensor=new Sensor(this);
            const rayCount = typeof CONFIG !== 'undefined' ? CONFIG.SENSOR_RAY_COUNT : this.sensor.rayCount;
            const hidden = typeof CONFIG !== 'undefined' ? CONFIG.NEURAL_NETWORK.HIDDEN_NEURONS : 6;
            const outputs = typeof CONFIG !== 'undefined' ? CONFIG.NEURAL_NETWORK.OUTPUT_NEURONS : 4;
            this.brain=new NeuralNetwork([rayCount, hidden, outputs]);
        }
        this.controls=new Controls(controlType);

        this.img=new Image();
        this.img.src="car.png"

        this.mask=document.createElement("canvas");
        this.mask.width=width;
        this.mask.height=height;

        const maskCtx=this.mask.getContext("2d");
        this.img.onload=()=>{
            maskCtx.fillStyle=color;
            maskCtx.rect(0,0,this.width,this.height);
            maskCtx.fill();

            maskCtx.globalCompositeOperation="destination-atop";
            maskCtx.drawImage(this.img,0,0,this.width,this.height);
        }
    }

    update(roadBorders,traffic){
        if(!this.damaged){
            // Move with current controls (may be set by brain or recovery)
            this.#move();
            this.fitness += Math.max(this.speed, 0);
            this.polygon=this.#createPolygon();
            const hit=this.#assessDamage(roadBorders,traffic);
            if(hit){
                if(this.useBrain){
                    // Enter recovery instead of being marked damaged immediately
                    this.recovering=true;
                    this.recoverFrames=90; // ~1.5s at 60fps
                }else{
                    this.damaged=true;
                }
            }
        }
        if(this.sensor){
            this.sensor.update(roadBorders,traffic);
            const offsets=this.sensor.readings.map(
                s=>s==null?0:1-s.offset
            );
            const outputs=NeuralNetwork.feedForward(offsets,this.brain);

            if(this.useBrain){
                // Sigmoid outputs are 0-1, use threshold (0.5) to determine activation
                this.controls.forward=outputs[0] > 0.5;
                this.controls.left=outputs[1] > 0.5;
                this.controls.right=outputs[2] > 0.5;
                this.controls.reverse=outputs[3] > 0.5;
            }
            // Lights override
            const mustStop = this.#mustStopForLight();
            if (mustStop){
                this.controls.forward=false;
                this.controls.reverse=false;
                if(this.speed>0){
                    this.speed=Math.max(0,this.speed - this.friction*2);
                }
            }

            // Lane-assist and auto-run when in AI mode and not recovering
            if(this.useBrain && !this.recovering){
                // Auto-run forward to prevent stalling (unless a light says stop)
                if (typeof CONFIG !== 'undefined' && CONFIG.AUTO_RUN && !mustStop){
                    if (this.speed < 0.1){
                        this.controls.forward = true;
                        this.controls.reverse = false;
                    }
                }
                // Gentle steering toward lane center if far from it
                if (typeof CONFIG !== 'undefined' && CONFIG.LANE_ASSIST){
                    const lane = this.#nearestLaneProjection();
                    if (lane){
                        const d = Math.hypot(lane.point.x - this.x, lane.point.y - this.y);
                        if (d > (CONFIG.LANE_ASSIST_THRESHOLD || 20)){
                            const toTarget = {x: lane.point.x - this.x, y: lane.point.y - this.y};
                            let delta = (-angle(toTarget) + Math.PI/2) - this.angle;
                            while(delta>Math.PI) delta-=2*Math.PI;
                            while(delta<-Math.PI) delta+=2*Math.PI;
                            const turnThresh = (typeof CONFIG !== 'undefined' ? CONFIG.TURN_SPEED : 0.03) * 1.5;
                            this.controls.left = delta > turnThresh;
                            this.controls.right = delta < -turnThresh;
                        }
                        // Hard enforcement: if deviation too large, force strong correction and cap speed
                        if (typeof CONFIG !== 'undefined' && CONFIG.HARD_LANE_ENFORCEMENT) {
                            const maxDev = CONFIG.HARD_LANE_MAX_DEVIATION || 35;
                            if (d > maxDev) {
                                const toTarget = {x: lane.point.x - this.x, y: lane.point.y - this.y};
                                let delta = (-angle(toTarget) + Math.PI/2) - this.angle;
                                while(delta>Math.PI) delta-=2*Math.PI;
                                while(delta<-Math.PI) delta+=2*Math.PI;
                                this.controls.forward = true;
                                this.controls.reverse = false;
                                // Strong steering
                                this.controls.left = delta > 0;
                                this.controls.right = delta < 0;
                                // Cap speed to avoid overshooting
                                const cap = (this.maxSpeed || 3) * 0.5;
                                if (this.speed > cap) {
                                    this.speed = Math.max(cap, this.speed - this.friction*2);
                                }
                                // If deviation is extreme, snap to lane center and align heading
                                if (d > maxDev * 1.8) {
                                    this.x = lane.point.x;
                                    this.y = lane.point.y;
                                    const laneDir = {x: (world && world.laneGuides && world.laneGuides.length) ? (world.laneGuides[0].p2.x - world.laneGuides[0].p1.x) : 0,
                                                     y: (world && world.laneGuides && world.laneGuides.length) ? (world.laneGuides[0].p2.y - world.laneGuides[0].p1.y) : -1 };
                                    this.angle = -angle(laneDir) + Math.PI/2;
                                    this.speed = Math.min(this.speed, cap * 0.5);
                                }
                            }
                        }
                    }
                }
            }

            // Recovery behavior: lane-aware re-center
            if(this.recovering){
                const lane = this.#nearestLaneProjection();
                const target = lane ? lane.point : null;
                let delta = 0;
                if (target){
                    const toTarget = {x: target.x - this.x, y: target.y - this.y};
                    const desired = -angle(toTarget) + Math.PI/2;
                    delta = desired - this.angle;
                    while(delta>Math.PI) delta-=2*Math.PI;
                    while(delta<-Math.PI) delta+=2*Math.PI;
                } else {
                    // fallback using sensors
                    const n=this.sensor.readings.length;
                    const leftAvg = this.#avgOffset(this.sensor.readings.slice(0, Math.floor(n/2)));
                    const rightAvg = this.#avgOffset(this.sensor.readings.slice(Math.floor(n/2)));
                    delta = (rightAvg < leftAvg) ? 0.5 : -0.5; // sign only
                }
                const turnThresh = (typeof CONFIG !== 'undefined' ? CONFIG.TURN_SPEED : 0.03) * 2;
                const distToLane = target ? Math.hypot(target.x - this.x, target.y - this.y) : Infinity;

                // Stage 1: reverse away from obstacle and orient toward lane
                if(this.recoverFrames > 45){
                    this.controls.forward=false;
                    this.controls.reverse=true;
                } else {
                    // Stage 2: move forward back to lane center
                    this.controls.reverse=false;
                    this.controls.forward=true;
                }
                this.controls.left = delta > turnThresh;
                this.controls.right = delta < -turnThresh;

                if(this.speed>0 && this.controls.reverse){
                    this.speed=Math.max(0,this.speed - this.friction*3);
                }
                this.recoverFrames--;
                // Leave recovery when clear or timer elapsed
                const stillHit=this.#assessDamage(roadBorders,traffic);
                if((!stillHit && this.recoverFrames<=0) || (distToLane<12)){
                    this.recovering=false;
                }
            }
        }
    }

    #avgOffset(list){
        if(!list || !list.length) return 1;
        let sum=0, cnt=0;
        for(const r of list){
            if(!r) continue;
            sum+=r.offset;
            cnt++;
        }
        return cnt? sum/cnt : 1;
    }

    #mustStopForLight(){
        try{
            if (typeof world === 'undefined' || !world || !Array.isArray(world.markings)) return false;
            const lights = world.markings.filter(m => typeof Light !== 'undefined' && m instanceof Light);
            if (!lights.length) return false;
            const px=this.x, py=this.y;
            for (const l of lights){
                if (!l || !l.center || (l.state!=='red' && l.state!=='yellow')) continue;
                const dx=l.center.x - px;
                const dy=l.center.y - py;
                const dist=Math.hypot(dx,dy);
                if (dist>140) continue;
                const forward = {x: -Math.sin(this.angle), y: -Math.cos(this.angle)};
                const dot = (dx*forward.x + dy*forward.y) / (dist || 1);
                if (dot>0.5){
                    return true;
                }
            }
            return false;
        }catch(_){
            return false;
        }
    }

    #nearestLaneProjection(){
        try{
            if (typeof world === 'undefined' || !world || !Array.isArray(world.laneGuides)) return null;
            let best=null; let bestD=Infinity;
            for(const seg of world.laneGuides){
                const ax=seg.p1.x, ay=seg.p1.y;
                const bx=seg.p2.x, by=seg.p2.y;
                const vx=bx-ax, vy=by-ay;
                const wx=this.x-ax, wy=this.y-ay;
                const vv=vx*vx+vy*vy || 1e-6;
                let t=(vx*wx+vy*wy)/vv; if(t<0) t=0; if(t>1) t=1;
                const qx=ax+vx*t, qy=ay+vy*t;
                const d=Math.hypot(qx-this.x, qy-this.y);
                if(d<bestD){ bestD=d; best={point:{x: qx, y: qy}, t}; }
            }
            return best;
        }catch(_){ return null; }
    }

    #assessDamage(roadBorders,traffic){
        for(let i=0;i<roadBorders.length;i++){
            if(polysIntersect(this.polygon,roadBorders[i])){
                return true;
            }
        }
        for(let i=0;i<traffic.length;i++){
            const otherPoly = traffic[i] && traffic[i].polygon;
            if(otherPoly && polysIntersect(this.polygon, otherPoly)){
                return true;
            }
        }
        return false;
    }

    /**
     * Creates a collision polygon for the car based on its position and rotation
     * @returns {Array} Array of 4 points representing the car's corners
     */
    #createPolygon(){
        const points=[];
        const rad=Math.hypot(this.width,this.height)/2;
        const alpha=Math.atan2(this.width,this.height);
        // Calculate all 4 corners of the rotated rectangle
        points.push({
            x:this.x-Math.sin(this.angle-alpha)*rad,
            y:this.y-Math.cos(this.angle-alpha)*rad
        });
        points.push({
            x:this.x-Math.sin(this.angle+alpha)*rad,
            y:this.y-Math.cos(this.angle+alpha)*rad
        });
        points.push({
            x:this.x-Math.sin(Math.PI+this.angle-alpha)*rad,
            y:this.y-Math.cos(Math.PI+this.angle-alpha)*rad
        });
        points.push({
            x:this.x-Math.sin(Math.PI+this.angle+alpha)*rad,
            y:this.y-Math.cos(Math.PI+this.angle+alpha)*rad
        });
        return points;
    }

    #move(){
        if(this.controls.forward){
            this.speed+=this.acceleration;
        }
        if(this.controls.reverse){
            this.speed-=this.acceleration;
        }

        if(this.speed>this.maxSpeed){
            this.speed=this.maxSpeed;
        }
        if(this.speed<-this.maxSpeed/2){
            this.speed=-this.maxSpeed/2;
        }

        if(this.speed>0){
            this.speed-=this.friction;
        }
        if(this.speed<0){
            this.speed+=this.friction;
        }
        if(Math.abs(this.speed)<this.friction){
            this.speed=0;
        }

        if(this.speed!=0){
            const flip=this.speed>0?1:-1;
            const turnSpeed = typeof CONFIG !== 'undefined' ? CONFIG.TURN_SPEED : 0.03;
            if(this.controls.left){
                this.angle+=turnSpeed*flip;
            }
            if(this.controls.right){
                this.angle-=turnSpeed*flip;
            }
        }

        this.x-=Math.sin(this.angle)*this.speed;
        this.y-=Math.cos(this.angle)*this.speed;
    }

    draw(ctx,drawSensor=false){
        if(this.sensor && drawSensor){
            this.sensor.draw(ctx);
        }

        ctx.save();
        ctx.translate(this.x,this.y);
        ctx.rotate(-this.angle);
        if(!this.damaged){
            ctx.drawImage(this.mask,
                -this.width/2,
                -this.height/2,
                this.width,
                this.height);
            ctx.globalCompositeOperation="multiply";
        }
        ctx.drawImage(this.img,
            -this.width/2,
            -this.height/2,
            this.width,
            this.height);
        ctx.restore();

    }
}