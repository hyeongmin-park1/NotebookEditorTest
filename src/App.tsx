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
    console.log("Creating fake context...");
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
      console.log("Token provided. Initializing kernel...");

      const serverSettings = ServerConnection.makeSettings({
        baseUrl: "http://localhost:8888",
        wsUrl: "ws://localhost:8888",
        token: token,
      });

      const kernelManager = new KernelManager({ serverSettings });

      kernelManager
        .startNew()
        .then(async (kernel) => {
          console.log("Kernel started:", kernel);
          setKernel(kernel);

          const context = await createFakeContext(kernel);
          const rendermime = new RenderMimeRegistry({
            initialFactories: standardRendererFactories,
          });

          managerRef.current = new JupyterLabManager(context, rendermime, {
            saveState: false,
          });
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
            console.log("Output area initialized");
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
    console.log("Editor mounted");
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
