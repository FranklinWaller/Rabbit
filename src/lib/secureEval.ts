export interface SecureEvalResult {
    type: 'secure-eval-iframe-result' | 'secure-eval-iframe-worker-terminated';
    [key: string]: any;
}

export function secureEval(code: string, timeLimit: number = 10000): Promise<SecureEvalResult> {
    return new Promise((resolve, reject) => {
        const secureEvalIframe: HTMLIFrameElement = document.createElement('iframe');
        secureEvalIframe.setAttribute('sandbox', 'allow-scripts');
        secureEvalIframe.setAttribute('style', 'display: none;');
        //TODO we probably don't need the try catch...the worker itself has an onerror listener that we can use to get all of the errors
        secureEvalIframe.setAttribute('src', 'data:text/html;base64,' + btoa(`
            <script>
                const evalWorkerSource = \`
                    onmessage = function(event) {
                        try {
                            eval(event.data);
                        }
                        catch(error) {
                            postMessage({
                                error: error.toString()
                            });
                        }
                    }
                \`;

                window.addEventListener('message', (event) => {
                    const blob = new window.Blob([evalWorkerSource], { type: 'application/javascript' });
                    const objectURL = window.URL.createObjectURL(blob);
                    const evalWorker = new Worker(objectURL);

                    evalWorker.postMessage(event.data);

                    setTimeout(() => { // Terminate the web worker if it runs for too long
                        evalWorker.terminate();
                        window.parent.postMessage(Object.assign({}, {
                            type: 'secure-eval-iframe-worker-terminated'
                        }), '*');
                    }, ${timeLimit});

                    evalWorker.addEventListener('message', (event) => {
                        window.parent.postMessage(Object.assign({}, event.data, {
                            type: 'secure-eval-iframe-result'
                        }), '*');
                    });
                });
            </script>
        `));

        secureEvalIframe.addEventListener('load', () => {
            secureEvalIframe.contentWindow.postMessage(code, '*'); // It is fine to the the targetOrigin as *, because we do not care if a malicious site reads the code that we send. The code is not expected to be confidential if it is client-side. We only care that when the code is executed that it does not cause harm, which is why it is going to the secure iframe
        });

        window.addEventListener('message', windowListener);

        document.body.appendChild(secureEvalIframe);

        function windowListener(event: MessageEvent) {
            // if (event.data.type !== 'secure-eval-iframe-result') { // Because we are listening to all messages on the window, we must check for only the result from our secure iframe
            //     return;
            // }

            window.removeEventListener('message', windowListener); // remove the listener to avoid a memory leak
            document.body.removeChild(secureEvalIframe); // remove the iframe to avoid a memory leak

            resolve(event.data);
        }
    });
}
