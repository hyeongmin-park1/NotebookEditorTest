import React, { useRef, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  KernelManager,
  ServerConnection,
  KernelMessage,
  ServiceManager,
} from "@jupyterlab/services";
import {
  RenderMimeRegistry,
  standardRendererFactories,
} from "@jupyterlab/rendermime";
import { OutputArea } from "@jupyterlab/outputarea";
import { CodeCellModel } from "@jupyterlab/cells";
import { Panel } from "@lumino/widgets";
import "@jupyterlab/outputarea/style/index.css";
import { WidgetManager as JupyterLabManager } from "@jupyter-widgets/jupyterlab-manager";
import { NotebookModel } from "@jupyterlab/notebook";
import { Context } from "@jupyterlab/docregistry";

const App: React.FC = () => {
  const editorRef = useRef<any>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [kernel, setKernel] = useState<any>(null);
  const [outputArea, setOutputArea] = useState<OutputArea | null>(null);
  const [token, setToken] = useState<string>("");
  const [kernelStarted, setKernelStarted] = useState<boolean>(false);
  const managerRef = useRef<JupyterLabManager | null>(null);

  // Fake Context 생성 함수
  const createFakeContext = async (kernel: any) => {
    const settings = ServerConnection.makeSettings({
      baseUrl: "http://localhost:8888",
      wsUrl: "ws://localhost:8888",
      token: token,
    });

    const serviceManager = new ServiceManager({ serverSettings: settings });
    await serviceManager.ready;

    return new Context({
      manager: serviceManager,
      factory: {
        name: "Notebook",
        contentType: "notebook",
        fileFormat: "json",
        preferredLanguage: () => "python",
        isDisposed: false,
        dispose: () => {},
        createNew: () => new NotebookModel(),
      },
      path: "fakePath.ipynb",
      kernelPreference: {
        shouldStart: true,
        canStart: true,
        autoStartDefault: true,
        name: kernel.name,
      },
    });
  };

  // 커널 및 위젯 매니저 초기화
  useEffect(() => {
    if (token) {
      const serverSettings = ServerConnection.makeSettings({
        baseUrl: "http://localhost:8888",
        wsUrl: "ws://localhost:8888",
        token: token,
      });

      const kernelManager = new KernelManager({ serverSettings });

      kernelManager
        .startNew()
        .then(async (kernel) => {
          setKernel(kernel);

          const context = await createFakeContext(kernel);
          const rendermime = new RenderMimeRegistry({
            initialFactories: standardRendererFactories,
          });

          managerRef.current = new JupyterLabManager(context, rendermime, {
            saveState: false,
          });
          ////// registerCommTarget을 프런트에서 진행해보려 함
          kernel.registerCommTarget("jupyter.widget", (comm, msg) => {
            const classicComm = {
              comm_id: comm.commId,
              target_name: comm.targetName,
              on_msg: (callback: (x: any) => void) => {
                comm.onMsg = (msg: KernelMessage.ICommMsgMsg) => {
                  callback(msg);
                };
              },
              on_close: (callback: (x: any) => void) => {
                comm.onClose = (msg: KernelMessage.ICommCloseMsg) => {
                  callback(msg);
                };
              },
              send: (
                data: any,
                callbacks?: any,
                metadata?: any,
                buffers?: ArrayBuffer[]
              ) => {
                comm.send(data, metadata, buffers);
                return comm.commId;
              },
              close: () => {
                comm.close();
                return comm.commId;
              },
              open: () => {
                console.log("Comm channel opened", comm.targetName);
                return comm.commId;
              },
            };

            managerRef.current?.handle_comm_open(classicComm, msg);
          });
          //////
          console.log("Widget manager initialized");

          // outputArea 초기화
          if (outputRef.current) {
            const model = new CodeCellModel({});
            const outputArea = new OutputArea({
              model: model.outputs,
              rendermime: rendermime,
              contentFactory: OutputArea.defaultContentFactory,
            });

            const panel = new Panel();
            panel.addWidget(outputArea);
            outputRef.current.appendChild(panel.node);

            setOutputArea(outputArea);
          }

          setKernelStarted(true);
        })
        .catch((error) => {
          console.error("Kernel start error:", error);
        });

      return () => {
        kernel?.shutdown().catch(console.error);
      };
    }
  }, [token]);

  // 코드 실행 함수
  const executeCode = () => {
    const code = editorRef.current?.getValue();
    console.log("Executing code:", code);

    if (kernel && code && outputArea) {
      outputArea.model.clear();
      const future = kernel.requestExecute({ code });

      future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
        outputArea.future = future;

        ////// 위젯 상태 처리 로직 추가
        if (
          msg.header.msg_type === "display_data" &&
          "data" in msg.content &&
          msg.content.data["application/vnd.jupyter.widget-state+json"]
        ) {
          const widgetState = msg.content.data[
            "application/vnd.jupyter.widget-state+json"
          ] as any;

          managerRef.current
            ?.set_state(widgetState)
            .then(() => {
              console.log(
                "Widget state has been applied successfully:",
                widgetState
              );
            })
            .catch((err) => {
              console.error("Failed to apply widget state:", err);
            });
        }
        //////
        console.log("Message received:", msg);
      };

      future.done
        .then(() => {
          console.log("Execution completed");
        })
        .catch((err: any) => {
          console.error("Execution error:", err);
        });
    } else {
      if (!kernel) {
        console.error("Kernel not initialized.");
      }
      if (!outputArea) {
        console.error("Output area not initialized.");
      }
    }
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  return (
    <div>
      <h1>Notebook Playground</h1>
      <div>
        <label>
          Enter Jupyter Token:
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
      </div>
      {kernelStarted && (
        <>
          <Editor
            theme="vs-dark"
            height="200px"
            defaultLanguage="python"
            defaultValue="# Enter Python code"
            onMount={handleEditorDidMount}
          />
          <button onClick={executeCode}>Run Code</button>
        </>
      )}
      <div ref={outputRef} className="output-area"></div>
    </div>
  );
};

export default App;
