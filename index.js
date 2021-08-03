import html2canvas from "html2canvas";
import RecordRTC from "recordrtc";
import { message as antdMessage, Modal } from "antd";
import { baseURL } from "@/config";
// import FFmpeg from '@ffmpeg/ffmpeg';
// import { saveAs } from 'file-saver';

// 导出视频
window.html2canvas = html2canvas;

let workerPath = `${
  process.env.NODE_ENV === "development"
    ? baseURL
    : process.env.BIM_ENV === "test"
    ? "http://192.168.0.69"
    : baseURL
}${process.env.PUBLIC_URL}/lib/ffmpeg_asm.js`;
let worker;
// if (document.domain == 'localhost') {
// 	workerPath = location.href.replace(location.href.split('/').pop(), '') + 'ffmpeg_asm.js';
// }

function processInWebWorker() {
  console.log(workerPath);
  const blob = URL.createObjectURL(
    new Blob(
      [
        `importScripts("${workerPath}");var now = Date.now;function print(text) {postMessage({"type" : "stdout","data" : text});};onmessage = function(event) {var message = event.data;if (message.type === "command") {var Module = {print: print,printErr: print,files: message.files || [],arguments: message.arguments || [],TOTAL_MEMORY: message.TOTAL_MEMORY || false};postMessage({"type" : "start","data" : Module.arguments.join(" ")});postMessage({"type" : "stdout","data" : "Received command: " +Module.arguments.join(" ") +((Module.TOTAL_MEMORY) ? ".  Processing with " + Module.TOTAL_MEMORY + " bits." : "")});var time = now();var result = ffmpeg_run(Module);var totalTime = now() - time;postMessage({"type" : "stdout","data" : "Finished processing (took " + totalTime + "ms)"});postMessage({"type" : "done","data" : result,"time" : totalTime});}};postMessage({"type" : "ready"});`,
      ],
      {
        type: "application/javascript",
      }
    )
  );

  const worker = new Worker(blob);
  URL.revokeObjectURL(blob);
  return worker;
}

// 将视频blob转为MP4
function convertStreams(videoBlob) {
  let aab;
  let buffersReady;
  // let workerReady;
  // let posted;

  let postMessage = function () {
    if (!worker) return;

    worker.postMessage({
      type: "command",
      // ffmpeg命令参数详解
      // http://ffmpeg.org/ffmpeg-filters.html
      // https://www.jianshu.com/p/049d03705a81
      // -i 输入处理视频
      // -c:v
      // -b:v 将输出文件的视频比特率
      // -r 24 24fps帧率
      // -s 720 * 480视频大小
      arguments:
        "-i video.webm -c:v mpeg4 -b:v 6400k -r 24 -s 720*480 -strict experimental output.mp4".split(
          " "
        ),
      files: [
        {
          data: new Uint8Array(aab),
          name: "video.webm",
        },
      ],
    });
  };

  let fileReader = new FileReader();
  fileReader.onload = function () {
    aab = this.result;
    postMessage();
  };
  fileReader.readAsArrayBuffer(videoBlob);

  if (!worker) {
    worker = processInWebWorker();
  }

  worker.onmessage = function (event) {
    let message = event.data;
    if (message.type == "ready") {
      console.log(workerPath + " file has been loaded.");

      if (buffersReady) postMessage();
    } else if (message.type == "stdout") {
      console.log(message.data);
    } else if (message.type == "start") {
      console.log(workerPath + " file received ffmpeg command.");
    } else if (message.type == "done") {
      const key = "updatable";

      console.log("done");
      antdMessage.destroy();
      antdMessage.success({ content: "转码成功！正在导出视频", key });

      let result = message.data[0];
      if (!message.data || !result || !result.data) {
        antdMessage.warn("转码错误，请重新操作");
        // worker && worker.terminate();
        return;
      }

      let blob = new File([result.data], "test.mp4", {
        type: "video/mp4",
      });

      setTimeout(() => {
        RecordRTC.invokeSaveAsDialog(blob, "viewpoint.mp4");
        antdMessage.success({ content: "导出成功!", duration: 2, key });
      }, 800);

      // worker && worker.terminate();
    }
  };

  worker.onerror = function () {
    antdMessage.destroy();
    antdMessage.warn("网络异常，文件加载失败，请重试");
  };
}

export default class ViewpointExportVideo {
  constructor(viewer) {
    this.viewer = viewer;
    this.elementToRecord = this.viewer.canvas;
    this.recorder = null;

    this.isStarRecord = false;
    this.isStopRecord = false;
    this.isPauseRecord = false;
  }

  async download(blob, callback) {
    // 方法一：
    // https://github.com/muaz-khan/RecordRTC/issues/349
    // const file = new File([blob], 'viewpoint.webm', {
    // 	type: 'video/mp4',
    // });

    // https://github.com/muaz-khan/RecordRTC/issues/464
    // ffmpeg fails to convert webm to mp4
    // const { createFFmpeg, fetchFile } = FFmpeg;
    // const ffmpeg = createFFmpeg({
    // 	// corePath: 'https://unpkg.com/@ffmpeg/core/dist/ffmpeg-core.js',
    // 	log: true,
    // });

    // await ffmpeg.load();
    // ffmpeg.FS('writeFile', 'x', await fetchFile(blob));
    // await ffmpeg.run('-i', 'x', 'viewpoint.mp4');
    // const data = ffmpeg.FS('readFile', 'viewpoint.mp4');

    // const newBlob = new Blob([data.buffer], { type: 'video/mp4' });

    // RecordRTC.invokeSaveAsDialog(newBlob, 'viewpoint.mp4');

    // 方法二：
    // saveAs(blob, 'viewpoint.mp4');

    // 方法三
    // const href = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.setAttribute('href', href);
    // a.setAttribute('style', 'display:none');
    // a.download = 'viewpoint.mp4';
    // document.body.appendChild(a);
    // a.click();
    // a.parentNode.removeChild(a);
    // URL.revokeObjectURL(href);

    if (typeof Worker !== "undefined") {
      Modal.confirm({
        title: "提示",
        content:
          "是否将视频转为MP4通用格式(转码消耗时间与录制视频大小有关)？取消将直接导出",
        getContainer: () =>
          window.viewer?.canvasWrap?.parentNode || document.body,
        okText: "确认转码",
        cancelText: "直接导出",
        onOk: () => {
          antdMessage.destroy();
          antdMessage.loading({
            content: "正在视频转码，请勿关闭页面...",
            duration: 0,
          });

          convertStreams(blob);
        },
        onCancel: () => {
          RecordRTC.invokeSaveAsDialog(blob, "viewpoint.mp4");
          antdMessage.success({ content: "导出成功!", duration: 2 });
        },
      });
    } else {
      RecordRTC.invokeSaveAsDialog(blob, "viewpoint.mp4");
      antdMessage.success({
        content: "您的浏览器暂不支持视频转码，直接导出成功!",
        duration: 2,
      });
    }

    callback && callback();
  }

  // 开始录制
  startRecord() {
    console.log("RecordRTC startRecording");

    if (this.isStarRecord) return;

    this.isStarRecord = true;

    if (!this.recorder) {
      console.log("录制初始化...");
      this.recorder = new RecordRTC(this.elementToRecord, {
        type: "canvas",
        mimeType: "video/webm;codecs=h264",
        recorderType: RecordRTC.CanvasRecorder,
        disableLogs: true,
        // timeSlice: 30,
        // quality: 10,
        // frameInterval: 99999,
        // videoBitsPerSecond: 128000 * 3,
      });
    }

    this.recorder.reset();
    this.recorder.startRecording();
  }

  // 暂停录制
  pauseRecord() {
    this.isPauseRecord = true;
    this.recorder.pauseRecording();
  }

  // 中断后继续录制
  resumeRecord() {
    this.isPauseRecord = false;
    this.isStopRecord = false;
    this.recorder.resumeRecording();
  }

  // 结束录制
  stopRecord(callback) {
    if (this.isStopRecord) return;

    this.isStopRecord = true;

    this.recorder?.stopRecording(() => {
      if (this.isPauseRecord) return;
      console.log("RecordRTC stopRecording");

      const blob = this.recorder.getBlob();
      this.download(blob, callback);

      this.destroy();
    });
  }

  // 销毁录制
  destroy() {
    this.recorder?.reset();
    this.recorder?.destroy();
    this.recorder = null;

    this.isStarRecord = false;
    this.isStopRecord = false;
    this.isPauseRecord = false;
  }
}
