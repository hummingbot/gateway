export class Stonfi {

    private constructor(network: string) {

    }


    public static getInstance(network: string): any {
        console.log('get instance')
    }

    public static init(network: string): any {
        console.log('init')
    }
}