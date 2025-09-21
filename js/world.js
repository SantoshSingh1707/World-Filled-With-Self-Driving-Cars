class World {
   constructor(graph,
      roadWidth = 100, 
      roadRoundness = 10,
      buildingWidth =150,
      buildingMinLength =150,
      spacing = 50
   ) {
      this.graph = graph;
      this.roadWidth = roadWidth;
      this.roadRoundness = roadRoundness;
      this.buildingWidth = buildingWidth;
      this.buildingMinLength = buildingMinLength
      this.spacing = spacing;

      this.envelopes = [];
      this.roadBorders = [];
      this.building = []

      this.generate();
   }

   generate() {
      this.envelopes.length = 0;
      for (const seg of this.graph.segments) {
         this.envelopes.push(
            new Envelope(seg, this.roadWidth, this.roadRoundness)
         );
      }

      this.roadBorders = Polygon.union(this.envelopes.map((e) => e.poly));

      this.building = this.#generateBuildings();
      
   }

   #generateBuildings(){
      const tmpEnvelope = []
      for(const seg of this.graph.segments){
         tmpEnvelope.push( new Envelope(
            seg,
            this.roadWidth + this.buildingWidth + this.spacing * 2,
            this.roadRoundness
         ));
      } 

      const gudies = Polygon.union(tmpEnvelope.map((e) => e.poly))

      for(let i=0 ; i<gudies.length;i++){
         const seg = gudies[i];
         if(seg.length() < this.buildingMinLength){
            gudies.splice(i,1);
            i--;
         }
      }

      const supports = []
      for(let seg of gudies){
         
      }
      
      
      return gudies;
   }
   
   draw(ctx) {
      for (const env of this.envelopes) {
         env.draw(ctx, { fill: "#BBB", stroke: "#BBB", lineWidth: 15 });
      }
      for (const seg of this.graph.segments) {
         seg.draw(ctx, { color: "white", width: 4, dash: [10, 10] });
      }
      for (const seg of this.roadBorders) {
         seg.draw(ctx, { color: "white", width: 4 });
      }
      for(const bld of this.building){
         bld.draw(ctx)   
      }
   }
}