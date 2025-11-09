class Controls{
    constructor(type){
        this.forward=false;
        this.left=false;
        this.right=false;
        this.reverse=false;

        switch(type){
            case "KEYS":
                this.#addKeyboardListeners();
                break;
            case "DUMMY":
                this.forward=true;
                break;
        }
    }

    #addKeyboardListeners(){
        document.onkeydown=(event)=>{
            switch(event.key){
                case "ArrowLeft":
                    event.preventDefault();
                    this.left=true;
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    this.right=true;
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    this.forward=true;
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    this.reverse=true;
                    break;
            }
        }
        document.onkeyup=(event)=>{
            switch(event.key){
                case "ArrowLeft":
                    event.preventDefault();
                    this.left=false;
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    this.right=false;
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    this.forward=false;
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    this.reverse=false;
                    break;
            }
        }
    }
}