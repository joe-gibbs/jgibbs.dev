let emailLink = document.getElementById("email");

emailLink.addEventListener("click", function(e) {
    e.preventDefault();

    let domain = "jgibbs.dev";
    let user = "joe";

    //create new mailto link and click it
    let mailto = document.createElement("a");
    mailto.href = "mailto:" + user + "@" + domain;
    mailto.click();
})