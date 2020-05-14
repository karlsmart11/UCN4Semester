//get data from the DOM
var selectedDevice;

window.addEventListener("load", () => {
  var f1 = document.querySelector("#form");

  f1.addEventListener("submit", function () {
    selectedDevice = document.querySelector("#deviceName").value;
    console.log(selectedDevice);
    getDevice(selectedDevice);
  });
});

let wappsto = new Wappsto();

const myMessage =
  "The application requires that the special network is running.";

const testseries = [
  {
    target: "Value 1",
    datapoints: [
      [12, Date.now() - 2000],
      [33, Date.now() - 1000],
      [54, Date.now()],
    ],
  },
  {
    target: "Value 2",
    datapoints: [
      [-14, Date.now() - 2000],
      [17, Date.now() - 1000],
      [-18, Date.now()],
    ],
  },
];

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
         //display device in the html
           var spanDeviceConnected = document.getElementById("NameSelected");
           spanDeviceConnected.innerHTML="The device "+selectedDevice+" is connected";
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

  jsonBody.targets.forEach((tar) => {
    let value = device.get("value").findWhere({ name: tar.target });
    if (value) {
      let reportState = value.get("state").findWhere({ type: "Report" });
      if (reportState) {
        series.push({
          target: tar.target,
          datapoints: getDataArray(
            reportState,
            jsonBody.range.from,
            jsonBody.range.to,
            jsonBody.maxDataPoints
          ),
        });
      }
    }
  });
  logger(series, testseries);
  sendData(extsync_request, 201, series);
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
}

function getDataArray(reportState, startDate, endDate, limit) {
  // TODO replace 3, with limit param
  let logsPromise = getLogs(reportState, startDate, endDate, 3);

  //const datapoints = {};
  const datapoints = [];

  logsPromise.then((values) => {
    //for (let i = 0; i < values.length; i++) { logs[i] = values[i]; }
    values.forEach((e) => {
      datapoints.push([parseInt(e.data), Date.parse(e.selected_timestamp)]);
    });
  });

  return datapoints;
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

function logger(series, testseries) {
  console.log("Completed package:");
  console.log(series);
  //console.log(testseries);
  console.log(JSON.stringify(series));
  //console.log(JSON.stringify(testseries));
}
