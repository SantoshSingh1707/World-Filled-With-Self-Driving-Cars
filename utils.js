function lerp(A,B,t){
    return A+(B-A)*t;
}

/**
 * Finds intersection point between two line segments AB and CD
 * Uses parametric line equations and Cramer's rule
 * @param {Object} A - Start point of first segment
 * @param {Object} B - End point of first segment
 * @param {Object} C - Start point of second segment
 * @param {Object} D - End point of second segment
 * @returns {Object|null} Intersection point with offset, or null if no intersection
 */
function getIntersection(A,B,C,D){ 
    // Calculate intersection using line-line intersection formula
    // Based on parametric equations and cross product
    const tTop=(D.x-C.x)*(A.y-C.y)-(D.y-C.y)*(A.x-C.x);
    const uTop=(C.y-A.y)*(A.x-B.x)-(C.x-A.x)*(A.y-B.y);
    const bottom=(D.y-C.y)*(B.x-A.x)-(D.x-C.x)*(B.y-A.y);
    
    if(bottom!=0){
        const t=tTop/bottom; // Parameter for segment AB (0-1 means on segment)
        const u=uTop/bottom; // Parameter for segment CD (0-1 means on segment)
        if(t>=0 && t<=1 && u>=0 && u<=1){
            return {
                x:lerp(A.x,B.x,t),
                y:lerp(A.y,B.y,t),
                offset:t // Distance along AB (0 = at A, 1 = at B)
            }
        }
    }

    return null;
}

function polysIntersect(poly1, poly2){
    for(let i=0;i<poly1.length;i++){
        for(let j=0;j<poly2.length;j++){
            const touch=getIntersection(
                poly1[i],
                poly1[(i+1)%poly1.length],
                poly2[j],
                poly2[(j+1)%poly2.length]
            );
            if(touch){
                return true;
            }
        }
    }
    return false;
}

function getRGBA(value){
    const alpha=Math.abs(value);
    const R=value<0?0:255;
    const G=R;
    const B=value>0?0:255;
    return "rgba("+R+","+G+","+B+","+alpha+")";
}

function getRandomColor(){
    const hue=290+Math.random()*260;
    return "hsl("+hue+", 100%, 60%)";
}
                