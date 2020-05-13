// This example shows how to request a device from a user.

let wappsto = new Wappsto();
const testseries = [
  {
    "target": "Value 1",
    "datapoints": [
      [111, 222],
      [333, 444],
      [123, 321]
    ]
  },
  {
    "target": "Value 2",
    "datapoints":
      [
        [555, 666],
        [777, 888]
      ]
  }
];

// Require Devices that matches "Sosche HD Air Ferrule" name. second argument provides a message that explains the need of this request
wappsto.get('device', {
  name: 'Sosche HD Air Ferrule'
}, {
  expand: 3,
  quantity: "all",
  subscribe: true,
  message: 'The application requires that the special network is running.',
  success: (deviceCollection) => {
    // When the request is successful, it means you already have the device.
    let device = deviceCollection.first();
    if (device) {
      // log device in the browser console
      //console.log("Here is the '" + device.get('name') + "' device!");
      //console.log(JSON.stringify(device));
      //console.log({ device });

      wappsto.wStream.subscribe('/extsync');

      wappsto.wStream.on('extsync_request', (extsync_request) => {
        console.log(extsync_request.uri + " - " + extsync_request.uri.replace('extsync', ''));

        switch (extsync_request.uri.replace('extsync', '')) {
          case '/search':
            search();
            break;

          case '/query':
            query();
            break;

          case '/annotations':
            //TODO
            break;

          case '/tag-keys':
            //TODO
            break;

          case '/tag-values':
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
      alert('service unavailable');
    }
  }
});

// --- functions --- //
function search(){
  let valueNames = [];
    device.get('value').forEach(v => {
      valueNames.push(v.attributes.name);
    });
    sendData(extsync_request, 200, valueNames);
}

function query(){
  let jsonBody = JSON.parse(extsync_request.body);
    let series = [];

    jsonBody.targets.forEach(tar => {
      let value = device.get('value').findWhere({ 'name': tar.target });
      if (value) {
        let reportState = value.get('state').findWhere({ 'type': 'Report' });
        if (reportState) {
          series.push({
            target: tar.target,
            datapoints: getDataArray(reportState, jsonBody.range.from, jsonBody.range.to, jsonBody.maxDataPoints)
          });
        }
      }
    });
    console.log("Completed package:");
    console.log(series);
    console.log(testseries);
    console.log(JSON.stringify(series));
    console.log(JSON.stringify(testseries));
    sendData(extsync_request, 201, series);
}

function sendData(extsync_request, httpcode, data) {
  wappsto.sendExtsync({
    type: 'response',
    useSession: true,
    url: '/' + extsync_request.meta.id,
    data: {
      code: httpcode,
      body: data,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "accept, content-type"
      }
    }
  });
}

function getDataArray(reportState, startDate, endDate, limit) {
  let logsPromise = getLogs(reportState, startDate, endDate, limit);

  //const datapoints = {};
  const datapoints = [];

  logsPromise.then(values => {
    //for (let i = 0; i < values.length; i++) { logs[i] = values[i]; }
    values.forEach(e => {
      datapoints.push(
        [parseInt(e.data), Date.parse(e.selected_timestamp)]);
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
            data = await getLogs(lastPoint.time || lastPoint.selected_timestamp, endDate);
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
      }
    });
  })
};
