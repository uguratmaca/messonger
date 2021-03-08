# messonger

To keep spotify app credentials, you need to create secrets.js file as below.


{% highlight javas %}

const secrets = () => {
    return {
        clientId: 'yourclientId',
        clientSecret: 'yourclientsecret'
    };
};

exports.secrets = secrets;

{% endhighlight %}


npm install
node app