//get data from the DOM
var selectedDevice, output;

window.addEventListener("load", () => {
  var f1 = document.querySelector("#form");
  output = document.getElementById("output");

  f1.addEventListener("submit", function () {
    selectedDevice = document.querySelector("#deviceName").value;
    console.log(selectedDevice);
    getDevice(selectedDevice);
  });
});

let wappsto = new Wappsto();

const myMessage =
  "The application requires that the special network is running.";

function getDevice(deviceName) {
  // Require Devices that matches the name argument.
  wappsto.get(
    "device",
    {
      name: deviceName,
    },
    {
      expand: 3,
      quantity: "all",
      subscribe: true,
      message: myMessage,
      success: (deviceCollection) => {
        // When the request is successful, it means you already have the device.
        let device = deviceCollection.first();
        if (device) {
          // log device in the browser console
          console.log("Here is the '" + device.get("name") + "' device!");

          var spanDeviceConnected = document.getElementById("NameSelected");
          spanDeviceConnected.innerHTML =
            "The device " + device.get("name") + " is connected";

          // Subscibe to the wappsto extsync service for direct communication.
          wappsto.wStream.subscribe("/extsync");

          // Eventhandler for the extsync_request event. Function is called when the service recieves a request with the right header.
          wappsto.wStream.on("extsync_request", (extsync_request) => {
            console.log(
              extsync_request.uri +
                " - " +
                extsync_request.uri.replace("extsync", "")
            );

            switch (extsync_request.uri.replace("extsync", "")) {
              case "/search":
                search(extsync_request, device);
                break;

              case "/query":
                query(extsync_request, device);
                break;

              case "/annotations":
                //TODO
                break;

              case "/tag-keys":
                //TODO
                break;

              case "/tag-values":
                //TODO
                break;

              default:
                //TODO errorhandling
                sendData(extsync_request, 200, {});
                break;
            }
          });
        }
      },
      error: (deviceCollection, response) => {
        // you receive an error when you don't have any devices. That is why we have to subscribe to stream
        if (response.status === 503) {
          alert("service unavailable");
        }
        console.log(response);
      },
    }
  );
}

// --- functions --- //
function search(extsync_request, device) {
  let valueNames = [];
  device.get("value").forEach((v) => {
    valueNames.push(v.attributes.name);
  });
  sendData(extsync_request, 200, valueNames);
}

function query(extsync_request, device) {
  // Parse the Grafana request to a workable object.
  let jsonBody = JSON.parse(extsync_request.body);
  let series = [];
  let logsPromises = [];

  jsonBody.targets.forEach((tar) => {
    let value = device.get("value").findWhere({ name: tar.target });
    if (value) {
      let reportState = value.get("state").findWhere({ type: "Report" });
      if (reportState) {
        logsPromises.push(
          getLogs(
            reportState,
            jsonBody.range.from,
            jsonBody.range.to,
            jsonBody.maxDataPoints
          )
        );
        series.push({ target: tar.target, datapoints: [] });
      }
    }
  });
  Promise.all(logsPromises).then((values) => {
    // values = [{data: int, selected_timestamp: string}, {..}, {..}]
    for (let i = 0; i < values.length; i++) {
      const data = values[i];
      series[i].datapoints = parseUDM(data);
    }

    sendData(extsync_request, 201, series);
  });
}

function sendData(extsync_request, httpcode, data) {
  wappsto.sendExtsync({
    type: "response",
    useSession: true,
    url: "/" + extsync_request.meta.id,
    data: {
      code: httpcode,
      body: data,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "accept, content-type",
      },
    },
  });
  writeToScreen(`Response sent - Code: ${httpcode}, endpoint: ${extsync_request.uri}, data: ${data}`);
}

function parseUDM(array) {
  const parsedArray = [];
  array.forEach((e) => {
    // e = {data: int, selected_timestamp: string} -> [int, int]
    parsedArray.push([parseInt(e.data), Date.parse(e.selected_timestamp)]);
  });
  return parsedArray;
}

function getLogs(reportState, startDate, endDate, limit) {
  return new Promise((resolve, reject) => {
    reportState.getLogs({
      query: `start=${startDate}&end=${endDate}&limit=${limit}`,
      success: async (model, response) => {
        if (response.more) {
          const lastPoint = response.data[response.data.length - 1];
          let data;
          try {
            data = await getLogs(
              lastPoint.time || lastPoint.selected_timestamp,
              endDate
            );
            data.shift();
          } catch (e) {
            data = [];
          }
          resolve([...response.data, ...data]);
        } else {
          resolve(response.data);
        }
      },
      error: () => {
        console.log("getLogs ERROR.");
        reject();
      },
    });
  });
}

function writeToScreen(msg) {
  var pre = document.createElement("p");
  pre.style.wordWrap = "break-word";
  pre.innerHTML = msg;
  output.appendChild(pre);
}
