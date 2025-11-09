/**
 * Neural Network implementation for car AI
 * Uses sigmoid activation function for smoother outputs
 */
class NeuralNetwork{
    constructor(neuronCounts){
        this.levels=[];
        for(let i=0;i<neuronCounts.length-1;i++){
            this.levels.push(new Level(
                neuronCounts[i],neuronCounts[i+1]
            ));
        }
    }

    static feedForward(givenInputs,network){
        let outputs=Level.feedForward(
            givenInputs,network.levels[0]);
        for(let i=1;i<network.levels.length;i++){
            outputs=Level.feedForward(
                outputs,network.levels[i]);
        }
        return outputs;
    }

    /**
     * Mutates a neural network by slightly modifying weights and biases
     * @param {Object} network - The network to mutate
     * @param {number} amount - Mutation strength (0-1)
     */
    static mutate(network,amount=1){
        network.levels.forEach(level => {
            for(let i=0;i<level.biases.length;i++){
                level.biases[i]=lerp(
                    level.biases[i],
                    Math.random()*2-1,
                    amount
                )
            }
            for(let i=0;i<level.weights.length;i++){
                for(let j=0;j<level.weights[i].length;j++){
                    level.weights[i][j]=lerp(
                        level.weights[i][j],
                        Math.random()*2-1,
                        amount
                    )
                }
            }
        });
    }

    /**
     * Creates a copy of a neural network
     * @returns {Object} Deep copy of the network
     */
    static copy(network){
        const copy = new NeuralNetwork([
            network.levels[0].inputs.length,
            ...network.levels.map(l => l.outputs.length)
        ]);
        
        for(let i=0;i<network.levels.length;i++){
            for(let j=0;j<network.levels[i].biases.length;j++){
                copy.levels[i].biases[j] = network.levels[i].biases[j];
            }
            for(let j=0;j<network.levels[i].weights.length;j++){
                for(let k=0;k<network.levels[i].weights[j].length;k++){
                    copy.levels[i].weights[j][k] = network.levels[i].weights[j][k];
                }
            }
        }
        return copy;
    }

    /**
     * Performs crossover between two parent networks
     * @param {Object} network1 - First parent network
     * @param {Object} network2 - Second parent network
     * @returns {Object} New network created from crossover
     */
    static crossover(network1, network2){
        const child = new NeuralNetwork([
            network1.levels[0].inputs.length,
            ...network1.levels.map(l => l.outputs.length)
        ]);

        for(let i=0;i<network1.levels.length;i++){
            for(let j=0;j<network1.levels[i].biases.length;j++){
                // Randomly inherit from either parent
                child.levels[i].biases[j] = Math.random() < 0.5 
                    ? network1.levels[i].biases[j] 
                    : network2.levels[i].biases[j];
            }
            for(let j=0;j<network1.levels[i].weights.length;j++){
                for(let k=0;k<network1.levels[i].weights[j].length;k++){
                    child.levels[i].weights[j][k] = Math.random() < 0.5
                        ? network1.levels[i].weights[j][k]
                        : network2.levels[i].weights[j][k];
                }
            }
        }
        return child;
    }
}

class Level{
    constructor(inputCount,outputCount){
        this.inputs=new Array(inputCount);
        this.outputs=new Array(outputCount);
        this.biases=new Array(outputCount);

        this.weights=[];
        for(let i=0;i<inputCount;i++){
            this.weights[i]=new Array(outputCount);
        }

        Level.#randomize(this);
    }

    static #randomize(level){
        for(let i=0;i<level.inputs.length;i++){
            for(let j=0;j<level.outputs.length;j++){
                level.weights[i][j]=Math.random()*2-1;
            }
        }

        for(let i=0;i<level.biases.length;i++){
            level.biases[i]=Math.random()*2-1;
        }
    }

    /**
     * Feedforward through a single level with sigmoid activation
     * @param {Array} givenInputs - Input values
     * @param {Object} level - Level to process
     * @returns {Array} Output values (0-1 range)
     */
    static feedForward(givenInputs,level){
        for(let i=0;i<level.inputs.length;i++){
            level.inputs[i]=givenInputs[i];
        }

        for(let i=0;i<level.outputs.length;i++){
            let sum=0
            for(let j=0;j<level.inputs.length;j++){
                sum+=level.inputs[j]*level.weights[j][i];
            }

            // Sigmoid activation function for smoother outputs
            // Output range: 0 to 1
            level.outputs[i] = Level.#sigmoid(sum - level.biases[i]);
        }

        return level.outputs;
    }

    /**
     * Sigmoid activation function: 1 / (1 + e^(-x))
     * Provides smooth outputs between 0 and 1
     */
    static #sigmoid(x){
        return 1 / (1 + Math.exp(-x));
    }
}