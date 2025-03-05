(async() => {
    const options = {
        timeZone: "Asia/Shanghai",
        hour12: false,
    };
    const beijingTime = new Date().toLocaleString('en-US',options);
    console.log(beijingTime)
})()