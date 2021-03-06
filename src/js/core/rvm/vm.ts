import { workerAddEventListener, extractMessageFromEvent } from "./utils/workerUtils";
import VirtualContext from "./lib/VirtualContext";
const metering = require('wasm-metering');

async function runWasm(wasmBinary: Uint8Array) {
    try {
        const context = new VirtualContext();

        // Instantiate the WebAssembly module with metering included
        const meteredWasm = metering.meterWASM(wasmBinary, {
            meterType: 'i32',
        });

        // const meteredWas = wasmBinary;

        const wasm = await WebAssembly.instantiate(meteredWasm, {
            metering: {
                usegas: (gas: number) => {
                    context.useGas(gas);
                }
            },
            ...context.getExposedFunctions(),
        });

        // Grow memory to 64Kib
        // @ts-ignore
        wasm.instance.exports.memory.grow(32);

        // Get the context ready on the client side
        // It is responsible of actually executing tasks.
        await context.init(wasm);

        const exports = wasm.instance.exports;

        if (!exports.main && !exports._main) {
            throw new Error(`Could not find entry 'main' on WASM binary`);
        }

        const main: any = exports.main || exports._main;
        main();

        // In WASM it's not required to use a extra layer of sandboxing
        // // Since we cannot trust the environment we have to sandbox the code.
        // // This code cannot access anything outside it's environment.
        // const sandboxInitator = () => {
        //     // We know that wasmExports is available in this sandbox code
        //     // See 'saferEval' call later in this code.
        //     // @ts-ignore
        //     const wasmContext = wasmExports;
        //     const mainFunc = wasmContext.main || wasmContext._main;
        //     mainFunc();
        // }

        // Execution was completed without any errors
        // The code probbably didn't call finish() on it's own
        // so it's safe to assume we can close the VM.
        // context.getExposedFunctions().finish(0, 0);
    } catch (error) {
        if (error.errorType !== 'VmError' && error.errorType !== 'FinishExecution') {
            console.error('[VM] Error:', error);
            throw error;
        }
    }
}

async function onMessage(event: any) {
    const data = extractMessageFromEvent(event);

    if (data.type === 'START') {
        await runWasm(data.value.wasm);
    }
}

workerAddEventListener('message', onMessage);
